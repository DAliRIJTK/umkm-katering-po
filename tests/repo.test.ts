import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { getDb } from "../src/lib/db";
import {
  createMenuPackage,
  createOrder,
  ensureInitialized,
  getCashRecap,
  getDailyCapacity,
  getPublicSnapshot,
  getShoppingList,
  listOrders,
  recordPayment,
  trackOrderPublic,
  transitionOrderStatus,
  updateSettings,
} from "../src/lib/repo/catering-repo";
import { ConflictError, NotFoundError, ValidationError } from "../src/lib/domain/errors";

describe("catering PostgreSQL repository (PGlite memory://)", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await getDb("memory://");
    await ensureInitialized(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it("initializes idempotently with 5 active packages and 5 seeded orders", async () => {
    await ensureInitialized(db);
    const snapshot = await getPublicSnapshot(db);
    expect(snapshot.packages).toHaveLength(5);
    expect(snapshot.settings.dailyCapacityBoxes).toBe(200);
    const orders = await listOrders(db);
    expect(orders).toHaveLength(5);
  });

  it("enforces daily capacity cap and frees quota upon cancellation", async () => {
    // Seeded 2026-11-28 already has 100 (PO-261127-01) + 50 (PO-261127-02) = 150 boxes
    const capBefore = await getDailyCapacity(db, "2026-11-28");
    expect(capBefore.usedBoxes).toBe(150);
    expect(capBefore.remainingBoxes).toBe(50);

    // 60 boxes should be rejected (150 + 60 = 210 > 200)
    await expect(
      createOrder(db, {
        customerName: "Panitia Seminar",
        institutionName: "FTI Kampus",
        customerPhone: "081299998888",
        deliveryAddress: "Jl. Ganesha, Coblong, Bandung",
        deliveryDate: "2026-11-28",
        deliveryTime: "09:00",
        notes: "",
        items: [{ packageId: 1, qty: 60 }],
      })
    ).rejects.toThrow(ConflictError);

    // 40 boxes succeeds (150 + 40 = 190 <= 200)
    const created = await createOrder(db, {
      customerName: "Panitia Seminar",
      institutionName: "FTI Kampus",
      customerPhone: "081299998888",
      deliveryAddress: "Jl. Ganesha, Coblong, Bandung",
      deliveryDate: "2026-11-28",
      deliveryTime: "09:00",
      notes: "Pedas dipisah",
      items: [{ packageId: 1, qty: 40 }],
    });
    expect(created.status).toBe("MENUNGGU_DP");
    expect(created.totalBoxes).toBe(40);

    // Cancelling frees the 40-box slot
    await transitionOrderStatus(db, created.id, "DIBATALKAN");
    const capAfterCancel = await getDailyCapacity(db, "2026-11-28");
    expect(capAfterCancel.usedBoxes).toBe(150);
  });

  it("enforces min_order_qty and rejects negative/oversized payments", async () => {
    await expect(
      createOrder(db, {
        customerName: "Tes Min",
        institutionName: "",
        customerPhone: "081233334444",
        deliveryAddress: "Bandung",
        deliveryDate: "2026-11-30",
        deliveryTime: "10:00",
        notes: "",
        items: [{ packageId: 1, qty: 5 }],
      })
    ).rejects.toThrow(ValidationError);

    const orders = await listOrders(db);
    const po4 = orders.find((o) => o.orderCode === "PO-261127-04")!;
    // PO-04 total = 1.400.000, min DP 30% = 420.000
    await expect(
      recordPayment(db, po4.id, { amountIdr: 0, method: "TUNAI", kind: "DP", note: "" })
    ).rejects.toThrow(ValidationError);

    await expect(
      recordPayment(db, po4.id, { amountIdr: 1_500_000, method: "TRANSFER", kind: "DP", note: "" })
    ).rejects.toThrow(ConflictError);

    // Partial DP below 30% keeps status MENUNGGU_DP
    const afterSmallDp = await recordPayment(db, po4.id, {
      amountIdr: 200_000,
      method: "TUNAI",
      kind: "DP",
      note: "DP tahap 1",
    });
    expect(afterSmallDp.status).toBe("MENUNGGU_DP");

    // Reaching >= 420.000 auto-promotes to TERJADWAL
    const afterFullDp = await recordPayment(db, po4.id, {
      amountIdr: 220_000,
      method: "QRIS",
      kind: "DP",
      note: "DP tahap 2",
    });
    expect(afterFullDp.status).toBe("TERJADWAL");
    expect(afterFullDp.paidIdr).toBe(420_000);
  });

  it("blocks SELESAI_DIKIRIM until paid in full", async () => {
    const orders = await listOrders(db);
    const po3 = orders.find((o) => o.orderCode === "PO-261127-03")!;
    expect(po3.status).toBe("SIAP_KIRIM");
    expect(po3.remainingIdr).toBe(560_000);

    await expect(transitionOrderStatus(db, po3.id, "SELESAI_DIKIRIM")).rejects.toThrow(ConflictError);

    await recordPayment(db, po3.id, {
      amountIdr: 560_000,
      method: "QRIS",
      kind: "PELUNASAN",
      note: "Pelunasan sebelum kurir jalan",
    });

    const delivered = await transitionOrderStatus(db, po3.id, "SELESAI_DIKIRIM");
    expect(delivered.status).toBe("SELESAI_DIKIRIM");
    expect(delivered.remainingIdr).toBe(0);
  });

  it("computes BOM shopping list and cash recap accurately", async () => {
    // 2026-11-28 has PO-01 (40 Ayam Bakar + 60 Snack Box) & PO-02 (50 Rendang)
    const bom = await getShoppingList(db, "2026-11-28", "2026-11-28");
    const beras = bom.find((b) => b.ingredientName === "Beras Pulen");
    const dusKraft = bom.find((b) => b.ingredientName === "Dus Kraft 20x20");
    expect(beras?.totalQty).toBe((40 + 50) * 150);
    expect(dusKraft?.totalQty).toBe(40 + 50);

    const recap = await getCashRecap(db);
    // Seeded payments: PO-01 1.000.000 (TRANSFER), PO-02 700.000 (QRIS), PO-03 400.000 (TUNAI), PO-05 950.000 (TRANSFER)
    expect(recap.byMethod.TRANSFER).toBe(1_950_000);
    expect(recap.byMethod.QRIS).toBe(700_000);
    expect(recap.byMethod.TUNAI).toBe(400_000);
    expect(recap.totalCollectedIdr).toBe(3_050_000);
  });

  it("verifies public /api/track by orderCode + last 4 phone digits without leaking phone", async () => {
    const tracked = await trackOrderPublic(db, "po-261127-03", "3344");
    expect(tracked.orderCode).toBe("PO-261127-03");
    expect(tracked.remainingIdr).toBe(560_000);
    expect("customerPhone" in tracked).toBe(false);

    await expect(trackOrderPublic(db, "PO-261127-03", "9999")).rejects.toThrow(NotFoundError);
  });

  it("updates admin capacity settings and adds new menu package with BOM", async () => {
    const updated = await updateSettings(db, { dailyCapacityBoxes: 250, minDpPercent: 40 });
    expect(updated.dailyCapacityBoxes).toBe(250);
    expect(updated.minDpPercent).toBe(40);

    const pkg = await createMenuPackage(db, {
      code: "PKT-GMP",
      name: "Nasi Kotak Ayam Geprek Sambal Matah",
      category: "NASI_KOTAK",
      description: "Ayam geprek crispy, sambal matah segar, lalapan, dus kraft.",
      unitLabel: "box",
      priceIdr: 28_000,
      minOrderQty: 15,
      ingredients: [
        { ingredientName: "Beras Pulen", category: "BAHAN_BAKU", qtyPerBox: 150, unit: "gram", estimatedUnitCostIdr: 16 },
        { ingredientName: "Dus Kraft 20x20", category: "KEMASAN", qtyPerBox: 1, unit: "pcs", estimatedUnitCostIdr: 1500 },
      ],
    });
    expect(pkg.code).toBe("PKT-GMP");
    expect(pkg.ingredients).toHaveLength(2);
  });
});
