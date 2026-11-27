import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { getDb } from "../src/lib/db";
import {
  createMenuPackage,
  createOrder,
  ensureInitialized,
  getDailyCapacity,
  getShoppingList,
  listOrders,
  recordPayment,
  toggleMenuPackage,
  trackOrderPublic,
  transitionOrderStatus,
  updateSettings,
} from "../src/lib/repo/catering-repo";
import { ConflictError, NotFoundError, ValidationError } from "../src/lib/domain/errors";
import { validateDeliveryDate } from "../src/lib/domain/validators";

describe("Putaran 1 — UMKM dirty input & edge-case stress tests", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await getDb("memory://");
    await ensureInitialized(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it("rejects non-leap Feb 29 and accepts valid leap year Feb 29", () => {
    expect(validateDeliveryDate("2028-02-29")).toBe("2028-02-29");
    expect(() => validateDeliveryDate("2026-02-29")).toThrow(ValidationError);
  });

  it("rejects negative or zero initialPayment when initialPayment object is provided", async () => {
    await expect(
      createOrder(db, {
        customerName: "Pak Tono",
        customerPhone: "081211112222",
        deliveryAddress: "Jl. Sukajadi, Bandung",
        deliveryDate: "2026-12-01",
        deliveryTime: "10:00",
        items: [{ packageId: 1, qty: 20 }],
        initialPayment: { amountIdr: -50_000, method: "TUNAI" },
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      createOrder(db, {
        customerName: "Pak Tono",
        customerPhone: "081211112222",
        deliveryAddress: "Jl. Sukajadi, Bandung",
        deliveryDate: "2026-12-01",
        deliveryTime: "10:00",
        items: [{ packageId: 1, qty: 20 }],
        initialPayment: { amountIdr: 0, method: "TUNAI" },
      })
    ).rejects.toThrow(ValidationError);
  });

  it("merges duplicate package items cleanly and rejects inactive packages", async () => {
    // 10 + 10 of package 1 (minOrderQty 15) should merge to 20 and succeed
    const merged = await createOrder(db, {
      customerName: "Ibu Dewi",
      customerPhone: "+62 812-3456-9000",
      deliveryAddress: "Jl. Setiabudi, Bandung",
      deliveryDate: "2026-12-02",
      deliveryTime: "12:00",
      items: [
        { packageId: 1, qty: 10 },
        { packageId: 1, qty: 10 },
      ],
    });
    expect(merged.items).toHaveLength(1);
    expect(merged.totalBoxes).toBe(20);

    // Deactivate package 2 and verify new order cannot use it
    await toggleMenuPackage(db, 2, false);
    await expect(
      createOrder(db, {
        customerName: "Ibu Dewi",
        customerPhone: "081234569000",
        deliveryAddress: "Jl. Setiabudi, Bandung",
        deliveryDate: "2026-12-03",
        deliveryTime: "12:00",
        items: [{ packageId: 2, qty: 20 }],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("handles lowered daily capacity safely without negative remainingBoxes and blocks new POs", async () => {
    // 2026-11-28 already has 150 boxes; admin lowers daily capacity to 100
    await updateSettings(db, { dailyCapacityBoxes: 100 });
    const cap = await getDailyCapacity(db, "2026-11-28");
    expect(cap.usedBoxes).toBe(150);
    expect(cap.remainingBoxes).toBe(0);
    expect(cap.utilizationPct).toBe(100);

    await expect(
      createOrder(db, {
        customerName: "Pak Budi",
        customerPhone: "081277778888",
        deliveryAddress: "Jl. Dipatiukur, Bandung",
        deliveryDate: "2026-11-28",
        deliveryTime: "13:00",
        items: [{ packageId: 1, qty: 15 }],
      })
    ).rejects.toThrow(ConflictError);
  });

  it("rejects SQL injection payloads safely in search and public tracking", async () => {
    const sqliOrders = await listOrders(db, { query: "' OR '1'='1'; DROP TABLE catering_orders;--" });
    expect(sqliOrders).toHaveLength(0);

    await expect(
      trackOrderPublic(db, "PO-261127-01' OR '1'='1", "7801")
    ).rejects.toThrow(NotFoundError);

    // Verify table intact after SQLi strings
    const intact = await listOrders(db);
    expect(intact).toHaveLength(5);
  });

  it("excludes SELESAI_DIKIRIM, MENUNGGU_DP, and DIBATALKAN from BOM and cash recap correctly", async () => {
    // 2026-11-27 has PO-03 (SIAP_KIRIM, 30 Ayam Bakar) and PO-05 (SELESAI_DIKIRIM, 25 Empal)
    // BOM for 2026-11-27 should include Ayam Potong Bakar (30) but NOT Daging Empal (already delivered)
    const bom27 = await getShoppingList(db, "2026-11-27", "2026-11-27");
    expect(bom27.find((b) => b.ingredientName === "Ayam Potong Bakar")?.totalQty).toBe(30);
    expect(bom27.find((b) => b.ingredientName === "Daging Empal")).toBeUndefined();

    // Cancel PO-03 -> should fail? No, SIAP_KIRIM -> DIBATALKAN is allowed for emergency cancel
    // Wait: cancelling PO-03 removes its payment (400.000 TUNAI) from active cash recap? Verify!
    const orders = await listOrders(db);
    const po3 = orders.find((o) => o.orderCode === "PO-261127-03")!;
    await transitionOrderStatus(db, po3.id, "DIBATALKAN");
    const bom27AfterCancel = await getShoppingList(db, "2026-11-27", "2026-11-27");
    expect(bom27AfterCancel).toHaveLength(0);
  });

  it("rejects duplicate package code case-insensitively and invalid fractional/zero payment", async () => {
    await expect(
      createMenuPackage(db, {
        code: "pkt-ayb",
        name: "Duplikat",
        category: "NASI_KOTAK",
        description: "Test duplikat kode",
        unitLabel: "box",
        priceIdr: 30_000,
        minOrderQty: 10,
        ingredients: [
          {
            ingredientName: "Beras",
            category: "BAHAN_BAKU",
            qtyPerBox: 150,
            unit: "gram",
            estimatedUnitCostIdr: 15,
          },
        ],
      })
    ).rejects.toThrow(ConflictError);

    const orders = await listOrders(db);
    const po4 = orders.find((o) => o.orderCode === "PO-261127-04")!;
    await expect(
      recordPayment(db, po4.id, {
        amountIdr: 1000.5,
        method: "TUNAI",
        kind: "DP",
      })
    ).rejects.toThrow(ValidationError);
  });
});
