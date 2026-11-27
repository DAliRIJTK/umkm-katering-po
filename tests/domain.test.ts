import { describe, expect, it } from "vitest";
import {
  calculateMinDpIdr,
  formatOrderWhatsAppSummary,
  formatRupiah,
  normalizePhone,
  phoneLast4,
  validateDeliveryDate,
  validateDeliveryTime,
} from "../src/lib/domain/validators";
import { assertTransitionAllowed } from "../src/lib/domain/state-machine";
import { aggregateShoppingList } from "../src/lib/domain/bom";
import {
  createSessionToken,
  hashPin,
  PinRateLimiter,
  verifyPin,
  verifySessionToken,
} from "../src/lib/domain/auth";
import { ConflictError, RateLimitError, ValidationError } from "../src/lib/domain/errors";

describe("domain validators & integer Rupiah math", () => {
  it("normalizes Indonesian phone numbers and extracts last 4 digits", () => {
    expect(normalizePhone("0812-3456-7801")).toBe("081234567801");
    expect(normalizePhone("+62 813 9876 5432")).toBe("081398765432");
    expect(phoneLast4("081234567801")).toBe("7801");
    expect(() => normalizePhone("12345")).toThrow(ValidationError);
    expect(() => normalizePhone("0812abc")).toThrow(ValidationError);
  });

  it("validates calendar dates and delivery time strictly", () => {
    expect(validateDeliveryDate("2026-11-28")).toBe("2026-11-28");
    expect(() => validateDeliveryDate("2026-02-30")).toThrow(ValidationError);
    expect(() => validateDeliveryDate("28-11-2026")).toThrow(ValidationError);

    expect(validateDeliveryTime("08:30")).toBe("08:30");
    expect(() => validateDeliveryTime("25:00")).toThrow(ValidationError);
    expect(() => validateDeliveryTime("8:30")).toThrow(ValidationError);
  });

  it("computes integer DP 30% ceiling without floating point drift", () => {
    expect(calculateMinDpIdr(1_000_000, 30)).toBe(300_000);
    expect(calculateMinDpIdr(950_000, 30)).toBe(285_000);
    expect(calculateMinDpIdr(33_335, 30)).toBe(10_001);
    expect(formatRupiah(2_240_000)).toBe("Rp 2.240.000");
  });

  it("formats WhatsApp order summary cleanly", () => {
    const text = formatOrderWhatsAppSummary({
      orderCode: "PO-261127-01",
      customerName: "Bu Aminah",
      institutionName: "Pengajian Al-Falah",
      deliveryDate: "2026-11-28",
      deliveryTime: "08:00",
      status: "DIPRODUKSI",
      totalIdr: 2_240_000,
      paidIdr: 1_000_000,
      remainingIdr: 1_240_000,
      items: [{ packageNameSnapshot: "Snack Box Pengajian", qty: 60, subtotalIdr: 960_000 }],
    }, "DapurRantang");

    expect(text).toContain("PO-261127-01");
    expect(text).toContain("DapurRantang");
    expect(text).toContain("60x Snack Box Pengajian");
    expect(text).toContain("Rp 1.240.000");
  });
});

describe("domain state machine & dual payment gates", () => {
  it("blocks MENUNGGU_DP -> TERJADWAL when DP is below 30%", () => {
    expect(() =>
      assertTransitionAllowed({
        fromStatus: "MENUNGGU_DP",
        toStatus: "TERJADWAL",
        totalIdr: 1_000_000,
        paidIdr: 299_000,
        minDpPercent: 30,
        itemCount: 1,
      })
    ).toThrow(ConflictError);
  });

  it("allows MENUNGGU_DP -> TERJADWAL when DP >= 30%", () => {
    expect(() =>
      assertTransitionAllowed({
        fromStatus: "MENUNGGU_DP",
        toStatus: "TERJADWAL",
        totalIdr: 1_000_000,
        paidIdr: 300_000,
        minDpPercent: 30,
        itemCount: 1,
      })
    ).not.toThrow();
  });

  it("blocks SIAP_KIRIM -> SELESAI_DIKIRIM when remaining balance > 0", () => {
    expect(() =>
      assertTransitionAllowed({
        fromStatus: "SIAP_KIRIM",
        toStatus: "SELESAI_DIKIRIM",
        totalIdr: 960_000,
        paidIdr: 400_000,
        minDpPercent: 30,
        itemCount: 1,
      })
    ).toThrow(ConflictError);
  });

  it("blocks terminal exit or skipping stages", () => {
    expect(() =>
      assertTransitionAllowed({
        fromStatus: "SELESAI_DIKIRIM",
        toStatus: "DIBATALKAN",
        totalIdr: 960_000,
        paidIdr: 960_000,
        minDpPercent: 30,
        itemCount: 1,
      })
    ).toThrow(ConflictError);

    expect(() =>
      assertTransitionAllowed({
        fromStatus: "MENUNGGU_DP",
        toStatus: "DIPRODUKSI",
        totalIdr: 960_000,
        paidIdr: 960_000,
        minDpPercent: 30,
        itemCount: 1,
      })
    ).toThrow(ConflictError);
  });
});

describe("domain BOM shopping list aggregation", () => {
  it("aggregates active production statuses only and sums ingredient quantities", () => {
    const result = aggregateShoppingList([
      {
        orderStatus: "TERJADWAL",
        itemQty: 40,
        ingredientName: "Beras Pulen",
        category: "BAHAN_BAKU",
        qtyPerBox: 150,
        unit: "gram",
        estimatedUnitCostIdr: 16,
      },
      {
        orderStatus: "DIPRODUKSI",
        itemQty: 50,
        ingredientName: "Beras Pulen",
        category: "BAHAN_BAKU",
        qtyPerBox: 150,
        unit: "gram",
        estimatedUnitCostIdr: 16,
      },
      {
        orderStatus: "MENUNGGU_DP",
        itemQty: 40,
        ingredientName: "Beras Pulen",
        category: "BAHAN_BAKU",
        qtyPerBox: 150,
        unit: "gram",
        estimatedUnitCostIdr: 16,
      },
      {
        orderStatus: "DIBATALKAN",
        itemQty: 20,
        ingredientName: "Beras Pulen",
        category: "BAHAN_BAKU",
        qtyPerBox: 150,
        unit: "gram",
        estimatedUnitCostIdr: 16,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].totalQty).toBe(13_500);
    expect(result[0].estimatedCostIdr).toBe(13_500 * 16);
  });
});

describe("domain PIN scrypt, HMAC session & rate limiting", () => {
  it("hashes and verifies 4-8 digit PINs with scrypt", () => {
    const { salt, hash } = hashPin("271127");
    expect(verifyPin("271127", salt, hash)).toBe(true);
    expect(verifyPin("000000", salt, hash)).toBe(false);
    expect(() => hashPin("123")).toThrow(ValidationError);
    expect(() => hashPin("abcd")).toThrow(ValidationError);
  });

  it("signs and verifies HMAC session tokens with expiry", () => {
    const secret = "test-ephemeral-secret-32-bytes-long!!";
    const token = createSessionToken(secret, 60_000, 1_000_000);
    expect(verifySessionToken(token, secret, 1_030_000)).toBe(true);
    expect(verifySessionToken(token, secret, 1_070_000)).toBe(false);
    expect(verifySessionToken(token + "x", secret, 1_030_000)).toBe(false);
  });

  it("locks out after 5 consecutive failed PIN attempts", () => {
    const limiter = new PinRateLimiter(5, 15 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      limiter.check("127.0.0.1", 1_000);
      limiter.recordFailure("127.0.0.1", 1_000);
    }
    expect(() => limiter.check("127.0.0.1", 2_000)).toThrow(RateLimitError);
    limiter.reset("127.0.0.1");
    expect(() => limiter.check("127.0.0.1", 2_000)).not.toThrow();
  });
});
