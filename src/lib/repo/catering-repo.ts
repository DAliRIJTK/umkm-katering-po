import type { PGlite } from "@electric-sql/pglite";
import { hashPin, verifyPin } from "../domain/auth";
import { aggregateShoppingList } from "../domain/bom";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors";
import { assertTransitionAllowed } from "../domain/state-machine";
import type {
  CashRecap,
  CateringOrder,
  CreateMenuPackageInput,
  CreateOrderInput,
  DailyCapacityInfo,
  IngredientCategory,
  MenuPackage,
  OrderItem,
  OrderPayment,
  OrderStatus,
  PackageCategory,
  PackageIngredient,
  PaymentKind,
  PaymentMethod,
  PublicOrderTrack,
  PublicSettings,
  RecordPaymentInput,
  ShoppingListItem,
  UpdateSettingsInput,
} from "../domain/types";
import {
  calculateMinDpIdr,
  normalizePhone,
  phoneLast4,
  validateDeliveryDate,
  validateDeliveryTime,
  validateNonEmptyText,
  validatePositiveInt,
} from "../domain/validators";
import { SCHEMA_SQL } from "../schema";

const initLocks = new WeakMap<PGlite, Promise<void>>();

export async function ensureInitialized(db: PGlite): Promise<void> {
  const existingLock = initLocks.get(db);
  if (existingLock) {
    return existingLock;
  }
  const run = (async () => {
    await db.exec(SCHEMA_SQL);
    await seedDatabaseIfEmpty(db);
  })();
  initLocks.set(db, run);
  try {
    await run;
  } catch (err) {
    initLocks.delete(db);
    throw err;
  }
}

async function seedDatabaseIfEmpty(db: PGlite): Promise<void> {
  const countRes = await db.query<{ cnt: string }>("SELECT COUNT(*)::text AS cnt FROM kitchen_settings");
  if (Number(countRes.rows[0]?.cnt ?? 0) > 0) {
    return;
  }

  const defaultPin = process.env.DAPUR_ADMIN_PIN || "271127";
  const { salt, hash } = hashPin(defaultPin);

  await db.query(
    `INSERT INTO kitchen_settings
      (id, business_name, whatsapp_number, address_area, daily_capacity_boxes, min_dp_percent, admin_pin_salt, admin_pin_hash)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    ["DapurRantang", "081200002711", "Coblong, Bandung", 200, 30, salt, hash]
  );

  const seedPackages: Array<{
    code: string;
    name: string;
    category: PackageCategory;
    description: string;
    unitLabel: string;
    priceIdr: number;
    minOrderQty: number;
    ingredients: Array<[string, IngredientCategory, number, string, number]>;
  }> = [
    {
      code: "PKT-AYB",
      name: "Nasi Kotak Ayam Bakar Madu",
      category: "NASI_KOTAK",
      description: "Nasi pulen hangat, ayam bakar bumbu madu, lalapan segar, sambal terasi, dan air mineral 330ml.",
      unitLabel: "box",
      priceIdr: 32_000,
      minOrderQty: 15,
      ingredients: [
        ["Beras Pulen", "BAHAN_BAKU", 150, "gram", 16],
        ["Ayam Potong Bakar", "BAHAN_BAKU", 1, "potong", 12000],
        ["Lalapan & Sambal Terasi", "BAHAN_BAKU", 1, "porsi", 2500],
        ["Dus Kraft 20x20", "KEMASAN", 1, "pcs", 1500],
        ["Air Mineral 330ml", "KEMASAN", 1, "pcs", 1200],
        ["Sendok & Tisu", "KEMASAN", 1, "set", 400],
      ],
    },
    {
      code: "PKT-RND",
      name: "Nasi Kotak Rendang Padang Komplit",
      category: "NASI_KOTAK",
      description: "Rendang daging sapi empuk, sayur nangka kapau, sambal hijau, nasi pulen, dan air mineral.",
      unitLabel: "box",
      priceIdr: 42_000,
      minOrderQty: 15,
      ingredients: [
        ["Beras Pulen", "BAHAN_BAKU", 150, "gram", 16],
        ["Daging Sapi Rendang", "BAHAN_BAKU", 120, "gram", 140],
        ["Sayur Nangka & Sambal Ijo", "BAHAN_BAKU", 1, "porsi", 3500],
        ["Dus Kraft 20x20", "KEMASAN", 1, "pcs", 1500],
        ["Air Mineral 330ml", "KEMASAN", 1, "pcs", 1200],
        ["Sendok & Tisu", "KEMASAN", 1, "set", 400],
      ],
    },
    {
      code: "PKT-EMP",
      name: "Nasi Kotak Empal Gentong & Telur Balado",
      category: "NASI_KOTAK",
      description: "Empal daging bumbu kuning gurih, telur balado, tumis buncis, dan kerupuk udang.",
      unitLabel: "box",
      priceIdr: 38_000,
      minOrderQty: 15,
      ingredients: [
        ["Beras Pulen", "BAHAN_BAKU", 150, "gram", 16],
        ["Daging Empal", "BAHAN_BAKU", 100, "gram", 145],
        ["Telur Balado", "BAHAN_BAKU", 1, "butir", 2500],
        ["Dus Kraft 20x20", "KEMASAN", 1, "pcs", 1500],
        ["Air Mineral 330ml", "KEMASAN", 1, "pcs", 1200],
      ],
    },
    {
      code: "PKT-SNK",
      name: "Snack Box Pengajian & Rapat (3 Kue)",
      category: "SNACK_BOX",
      description: "Kombinasi risoles mayo, lemper ayam bakar, kue lumpur kentang, dan air mineral gelas 220ml.",
      unitLabel: "box",
      priceIdr: 16_000,
      minOrderQty: 20,
      ingredients: [
        ["Risoles Mayo", "BAHAN_BAKU", 1, "pcs", 3000],
        ["Lemper Ayam", "BAHAN_BAKU", 1, "pcs", 3000],
        ["Kue Lumpur Kentang", "BAHAN_BAKU", 1, "pcs", 2500],
        ["Dus Snack 16x12", "KEMASAN", 1, "pcs", 900],
        ["Air Mineral 220ml", "KEMASAN", 1, "pcs", 600],
      ],
    },
    {
      code: "PKT-KNG",
      name: "Nasi Kuning Syukuran Komplit",
      category: "TUMPENG_PRASMANAN",
      description: "Nasi kuning harum sereh, ayam goreng lengkuas, perkedel kentang, dan orek tempe kering.",
      unitLabel: "box",
      priceIdr: 35_000,
      minOrderQty: 20,
      ingredients: [
        ["Beras Kuning", "BAHAN_BAKU", 160, "gram", 18],
        ["Ayam Goreng Lengkuas", "BAHAN_BAKU", 1, "potong", 12000],
        ["Perkedel & Orek Tempe", "BAHAN_BAKU", 1, "porsi", 3500],
        ["Dus Mika Bento", "KEMASAN", 1, "pcs", 2200],
        ["Sendok & Tisu", "KEMASAN", 1, "set", 400],
      ],
    },
  ];

  const pkgIds = new Map<string, { id: number; name: string; priceIdr: number }>();
  for (const pkg of seedPackages) {
    const pkgRes = await db.query<{ id: number }>(
      `INSERT INTO menu_packages (code, name, category, description, unit_label, price_idr, min_order_qty, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id`,
      [pkg.code, pkg.name, pkg.category, pkg.description, pkg.unitLabel, pkg.priceIdr, pkg.minOrderQty]
    );
    const pkgId = pkgRes.rows[0].id;
    pkgIds.set(pkg.code, { id: pkgId, name: pkg.name, priceIdr: pkg.priceIdr });

    for (const [ingName, cat, qtyPerBox, unit, cost] of pkg.ingredients) {
      await db.query(
        `INSERT INTO package_ingredients (package_id, ingredient_name, category, qty_per_box, unit, estimated_unit_cost_idr)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pkgId, ingName, cat, qtyPerBox, unit, cost]
      );
    }
  }

  const seedOrders: Array<{
    orderCode: string;
    customerName: string;
    institutionName: string;
    customerPhone: string;
    deliveryAddress: string;
    deliveryDate: string;
    deliveryTime: string;
    notes: string;
    status: OrderStatus;
    items: Array<{ code: string; qty: number }>;
    payments: Array<{ amountIdr: number; method: PaymentMethod; kind: PaymentKind; note: string }>;
  }> = [
    {
      orderCode: "PO-261127-01",
      customerName: "Bu Aminah",
      institutionName: "Pengajian Al-Falah",
      customerPhone: "081234567801",
      deliveryAddress: "Jl. Tubagus Ismail, Coblong, Bandung",
      deliveryDate: "2026-11-28",
      deliveryTime: "08:00",
      notes: "Antar ke aula masjid lantai 1",
      status: "DIPRODUKSI",
      items: [
        { code: "PKT-SNK", qty: 60 },
        { code: "PKT-AYB", qty: 40 },
      ],
      payments: [{ amountIdr: 1_000_000, method: "TRANSFER", kind: "DP", note: "DP awal pengajian" }],
    },
    {
      orderCode: "PO-261127-02",
      customerName: "Pak Wahyu",
      institutionName: "Dinas Koperasi Kota",
      customerPhone: "081398765432",
      deliveryAddress: "Jl. Wastukencana, Bandung Wetan",
      deliveryDate: "2026-11-28",
      deliveryTime: "11:30",
      notes: "Minta nota berstempel",
      status: "TERJADWAL",
      items: [{ code: "PKT-RND", qty: 50 }],
      payments: [{ amountIdr: 700_000, method: "QRIS", kind: "DP", note: "DP 33% rapat dinas" }],
    },
    {
      orderCode: "PO-261127-03",
      customerName: "Mbak Nita",
      institutionName: "Klinik Sehat Pratama",
      customerPhone: "085611223344",
      deliveryAddress: "Jl. Buah Batu, Lengkong, Bandung",
      deliveryDate: "2026-11-27",
      deliveryTime: "17:00",
      notes: "Sambal dipisah untuk 10 box",
      status: "SIAP_KIRIM",
      items: [{ code: "PKT-AYB", qty: 30 }],
      payments: [{ amountIdr: 400_000, method: "TUNAI", kind: "DP", note: "Titip DP di kasir" }],
    },
    {
      orderCode: "PO-261127-04",
      customerName: "Mas Riko",
      institutionName: "Karang Taruna RW 05",
      customerPhone: "082144556677",
      deliveryAddress: "Jl. Antapani Lama, Antapani, Bandung",
      deliveryDate: "2026-11-29",
      deliveryTime: "09:30",
      notes: "Menunggu konfirmasi bendahara",
      status: "MENUNGGU_DP",
      items: [{ code: "PKT-KNG", qty: 40 }],
      payments: [],
    },
    {
      orderCode: "PO-261127-05",
      customerName: "Ibu Ratna",
      institutionName: "PT Karya Mandiri",
      customerPhone: "081788990011",
      deliveryAddress: "Jl. Asia Afrika, Sumur Bandung",
      deliveryDate: "2026-11-27",
      deliveryTime: "11:00",
      notes: "Sudah diterima resepsionis",
      status: "SELESAI_DIKIRIM",
      items: [{ code: "PKT-EMP", qty: 25 }],
      payments: [{ amountIdr: 950_000, method: "TRANSFER", kind: "PELUNASAN", note: "Lunas di muka" }],
    },
  ];

  for (const ord of seedOrders) {
    let totalBoxes = 0;
    let totalIdr = 0;
    const resolved = ord.items.map((item) => {
      const pkg = pkgIds.get(item.code)!;
      const subtotalIdr = item.qty * pkg.priceIdr;
      totalBoxes += item.qty;
      totalIdr += subtotalIdr;
      return { ...pkg, qty: item.qty, subtotalIdr };
    });

    const ordRes = await db.query<{ id: number }>(
      `INSERT INTO catering_orders
        (order_code, customer_name, institution_name, customer_phone, delivery_address, delivery_date, delivery_time, notes, status, total_boxes, total_idr)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        ord.orderCode,
        ord.customerName,
        ord.institutionName,
        ord.customerPhone,
        ord.deliveryAddress,
        ord.deliveryDate,
        ord.deliveryTime,
        ord.notes,
        ord.status,
        totalBoxes,
        totalIdr,
      ]
    );
    const orderId = ordRes.rows[0].id;

    for (const item of resolved) {
      await db.query(
        `INSERT INTO order_items (order_id, package_id, package_name_snapshot, qty, unit_price_idr, subtotal_idr)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.id, item.name, item.qty, item.priceIdr, item.subtotalIdr]
      );
    }

    for (const pay of ord.payments) {
      await db.query(
        `INSERT INTO order_payments (order_id, amount_idr, method, kind, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, pay.amountIdr, pay.method, pay.kind, pay.note]
      );
    }
  }
}

export async function getSettingsRow(db: PGlite) {
  const res = await db.query<{
    business_name: string;
    whatsapp_number: string;
    address_area: string;
    daily_capacity_boxes: number;
    min_dp_percent: number;
    admin_pin_salt: string;
    admin_pin_hash: string;
  }>(
    `SELECT business_name, whatsapp_number, address_area, daily_capacity_boxes, min_dp_percent, admin_pin_salt, admin_pin_hash
     FROM kitchen_settings WHERE id = 1`
  );
  if (res.rows.length === 0) {
    throw new NotFoundError("Pengaturan dapur belum diinisialisasi.");
  }
  return res.rows[0];
}

export async function getPublicSettings(db: PGlite): Promise<PublicSettings> {
  const row = await getSettingsRow(db);
  return {
    businessName: row.business_name,
    whatsappNumber: row.whatsapp_number,
    addressArea: row.address_area,
    dailyCapacityBoxes: row.daily_capacity_boxes,
    minDpPercent: row.min_dp_percent,
  };
}

export async function verifyAdminPin(db: PGlite, pin: string): Promise<boolean> {
  const row = await getSettingsRow(db);
  return verifyPin(pin, row.admin_pin_salt, row.admin_pin_hash);
}

export async function listMenuPackages(
  db: PGlite,
  options?: { includeInactive?: boolean }
): Promise<MenuPackage[]> {
  const whereClause = options?.includeInactive ? "" : "WHERE is_active = TRUE";
  const pkgRes = await db.query<{
    id: number;
    code: string;
    name: string;
    category: PackageCategory;
    description: string;
    unit_label: string;
    price_idr: number;
    min_order_qty: number;
    is_active: boolean;
  }>(
    `SELECT id, code, name, category, description, unit_label, price_idr, min_order_qty, is_active
     FROM menu_packages ${whereClause} ORDER BY id ASC`
  );

  const ingRes = await db.query<{
    id: number;
    package_id: number;
    ingredient_name: string;
    category: IngredientCategory;
    qty_per_box: number;
    unit: string;
    estimated_unit_cost_idr: number;
  }>(
    `SELECT id, package_id, ingredient_name, category, qty_per_box, unit, estimated_unit_cost_idr
     FROM package_ingredients ORDER BY id ASC`
  );

  const ingByPkg = new Map<number, PackageIngredient[]>();
  for (const r of ingRes.rows) {
    const list = ingByPkg.get(r.package_id) ?? [];
    list.push({
      id: r.id,
      packageId: r.package_id,
      ingredientName: r.ingredient_name,
      category: r.category,
      qtyPerBox: r.qty_per_box,
      unit: r.unit,
      estimatedUnitCostIdr: r.estimated_unit_cost_idr,
    });
    ingByPkg.set(r.package_id, list);
  }

  return pkgRes.rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    description: p.description,
    unitLabel: p.unit_label,
    priceIdr: p.price_idr,
    minOrderQty: p.min_order_qty,
    isActive: p.is_active,
    ingredients: ingByPkg.get(p.id) ?? [],
  }));
}

export async function getDailyCapacity(db: PGlite, dateStr: string): Promise<DailyCapacityInfo> {
  const validDate = validateDeliveryDate(dateStr);
  const settings = await getSettingsRow(db);
  const res = await db.query<{ used: string }>(
    `SELECT COALESCE(SUM(total_boxes), 0)::text AS used
     FROM catering_orders
     WHERE delivery_date = $1::date AND status <> 'DIBATALKAN'`,
    [validDate]
  );
  const usedBoxes = Number(res.rows[0]?.used ?? 0);
  const capacityBoxes = settings.daily_capacity_boxes;
  const remainingBoxes = Math.max(0, capacityBoxes - usedBoxes);
  const utilizationPct = Math.min(100, Math.round((usedBoxes / capacityBoxes) * 100));
  return {
    date: validDate,
    usedBoxes,
    capacityBoxes,
    remainingBoxes,
    utilizationPct,
  };
}

export async function getPublicSnapshot(db: PGlite, dates?: string[]) {
  const settings = await getPublicSettings(db);
  const packages = await listMenuPackages(db, { includeInactive: false });
  const targetDates = dates && dates.length > 0 ? dates : ["2026-11-27", "2026-11-28", "2026-11-29"];
  const capacities: DailyCapacityInfo[] = [];
  for (const d of targetDates) {
    capacities.push(await getDailyCapacity(db, d));
  }
  return { settings, packages, capacities };
}

async function hydrateOrders(
  db: PGlite,
  orderRows: Array<{
    id: number;
    order_code: string;
    customer_name: string;
    institution_name: string;
    customer_phone: string;
    delivery_address: string;
    delivery_date: string;
    delivery_time: string;
    notes: string;
    status: OrderStatus;
    total_boxes: number;
    total_idr: number;
    created_at: string;
    updated_at: string;
  }>,
  minDpPercent: number
): Promise<CateringOrder[]> {
  if (orderRows.length === 0) return [];
  const ids = orderRows.map((o) => o.id);

  const itemsRes = await db.query<{
    id: number;
    order_id: number;
    package_id: number;
    package_name_snapshot: string;
    qty: number;
    unit_price_idr: number;
    subtotal_idr: number;
  }>(
    `SELECT id, order_id, package_id, package_name_snapshot, qty, unit_price_idr, subtotal_idr
     FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id ASC`,
    [ids]
  );

  const paysRes = await db.query<{
    id: number;
    order_id: number;
    amount_idr: number;
    method: PaymentMethod;
    kind: PaymentKind;
    paid_at: string;
    note: string;
  }>(
    `SELECT id, order_id, amount_idr, method, kind, paid_at::text AS paid_at, note
     FROM order_payments WHERE order_id = ANY($1::int[]) ORDER BY paid_at ASC, id ASC`,
    [ids]
  );

  const itemsByOrder = new Map<number, OrderItem[]>();
  for (const r of itemsRes.rows) {
    const arr = itemsByOrder.get(r.order_id) ?? [];
    arr.push({
      id: r.id,
      orderId: r.order_id,
      packageId: r.package_id,
      packageNameSnapshot: r.package_name_snapshot,
      qty: r.qty,
      unitPriceIdr: r.unit_price_idr,
      subtotalIdr: r.subtotal_idr,
    });
    itemsByOrder.set(r.order_id, arr);
  }

  const paysByOrder = new Map<number, OrderPayment[]>();
  for (const r of paysRes.rows) {
    const arr = paysByOrder.get(r.order_id) ?? [];
    arr.push({
      id: r.id,
      orderId: r.order_id,
      amountIdr: r.amount_idr,
      method: r.method,
      kind: r.kind,
      paidAt: r.paid_at,
      note: r.note,
    });
    paysByOrder.set(r.order_id, arr);
  }

  return orderRows.map((o) => {
    const payments = paysByOrder.get(o.id) ?? [];
    const paidIdr = payments.reduce((sum, p) => sum + p.amountIdr, 0);
    return {
      id: o.id,
      orderCode: o.order_code,
      customerName: o.customer_name,
      institutionName: o.institution_name,
      customerPhone: o.customer_phone,
      deliveryAddress: o.delivery_address,
      deliveryDate: o.delivery_date,
      deliveryTime: o.delivery_time,
      notes: o.notes,
      status: o.status,
      totalBoxes: o.total_boxes,
      totalIdr: o.total_idr,
      paidIdr,
      remainingIdr: Math.max(0, o.total_idr - paidIdr),
      minDpIdr: calculateMinDpIdr(o.total_idr, minDpPercent),
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      items: itemsByOrder.get(o.id) ?? [],
      payments,
    };
  });
}

export async function listOrders(
  db: PGlite,
  filters?: { status?: OrderStatus; date?: string; query?: string }
): Promise<CateringOrder[]> {
  const settings = await getSettingsRow(db);
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters?.date) {
    params.push(validateDeliveryDate(filters.date));
    clauses.push(`delivery_date = $${params.length}::date`);
  }
  if (filters?.query?.trim()) {
    params.push(`%${filters.query.trim().toLowerCase()}%`);
    clauses.push(
      `(LOWER(order_code) LIKE $${params.length} OR LOWER(customer_name) LIKE $${params.length} OR LOWER(institution_name) LIKE $${params.length})`
    );
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await db.query<{
    id: number;
    order_code: string;
    customer_name: string;
    institution_name: string;
    customer_phone: string;
    delivery_address: string;
    delivery_date: string;
    delivery_time: string;
    notes: string;
    status: OrderStatus;
    total_boxes: number;
    total_idr: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, order_code, customer_name, institution_name, customer_phone, delivery_address,
            TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date, delivery_time, notes, status,
            total_boxes, total_idr, created_at::text AS created_at, updated_at::text AS updated_at
     FROM catering_orders ${whereSql}
     ORDER BY delivery_date ASC, delivery_time ASC, id DESC`,
    params
  );

  return hydrateOrders(db, res.rows, settings.min_dp_percent);
}

export async function getOrderById(db: PGlite, orderId: number): Promise<CateringOrder> {
  const settings = await getSettingsRow(db);
  const res = await db.query<{
    id: number;
    order_code: string;
    customer_name: string;
    institution_name: string;
    customer_phone: string;
    delivery_address: string;
    delivery_date: string;
    delivery_time: string;
    notes: string;
    status: OrderStatus;
    total_boxes: number;
    total_idr: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, order_code, customer_name, institution_name, customer_phone, delivery_address,
            TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date, delivery_time, notes, status,
            total_boxes, total_idr, created_at::text AS created_at, updated_at::text AS updated_at
     FROM catering_orders WHERE id = $1`,
    [orderId]
  );
  if (res.rows.length === 0) {
    throw new NotFoundError("Pre-order tidak ditemukan.");
  }
  const [hydrated] = await hydrateOrders(db, res.rows, settings.min_dp_percent);
  return hydrated;
}

export async function trackOrderPublic(
  db: PGlite,
  orderCode: string,
  last4Digits: string
): Promise<PublicOrderTrack> {
  const code = validateNonEmptyText(orderCode, "Kode PO", 32).toUpperCase();
  const last4 = String(last4Digits ?? "").trim();
  if (!/^\d{4}$/.test(last4)) {
    throw new ValidationError("4 digit terakhir nomor HP wajib berisi 4 angka.");
  }

  const settings = await getSettingsRow(db);
  const res = await db.query<{
    id: number;
    order_code: string;
    customer_name: string;
    institution_name: string;
    customer_phone: string;
    delivery_address: string;
    delivery_date: string;
    delivery_time: string;
    notes: string;
    status: OrderStatus;
    total_boxes: number;
    total_idr: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, order_code, customer_name, institution_name, customer_phone, delivery_address,
            TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date, delivery_time, notes, status,
            total_boxes, total_idr, created_at::text AS created_at, updated_at::text AS updated_at
     FROM catering_orders WHERE UPPER(order_code) = $1`,
    [code]
  );
  if (res.rows.length === 0) {
    throw new NotFoundError("Kode PO atau 4 digit HP tidak cocok.");
  }
  const [order] = await hydrateOrders(db, res.rows, settings.min_dp_percent);
  if (phoneLast4(order.customerPhone) !== last4) {
    throw new NotFoundError("Kode PO atau 4 digit HP tidak cocok.");
  }

  return {
    orderCode: order.orderCode,
    customerName: order.customerName,
    institutionName: order.institutionName,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    status: order.status,
    totalBoxes: order.totalBoxes,
    totalIdr: order.totalIdr,
    paidIdr: order.paidIdr,
    remainingIdr: order.remainingIdr,
    minDpIdr: order.minDpIdr,
    items: order.items.map((i) => ({
      packageNameSnapshot: i.packageNameSnapshot,
      qty: i.qty,
      unitPriceIdr: i.unitPriceIdr,
      subtotalIdr: i.subtotalIdr,
    })),
    payments: order.payments.map((p) => ({
      amountIdr: p.amountIdr,
      method: p.method,
      kind: p.kind,
      paidAt: p.paidAt,
    })),
  };
}

export async function createOrder(db: PGlite, input: CreateOrderInput): Promise<CateringOrder> {
  const customerName = validateNonEmptyText(input.customerName, "Nama pemesan", 120);
  const institutionName = String(input.institutionName ?? "").trim().slice(0, 120);
  const customerPhone = normalizePhone(input.customerPhone);
  const deliveryAddress = validateNonEmptyText(input.deliveryAddress, "Alamat pengantaran", 300);
  const deliveryDate = validateDeliveryDate(input.deliveryDate);
  const deliveryTime = validateDeliveryTime(input.deliveryTime);
  const notes = String(input.notes ?? "").trim().slice(0, 500);

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError("Minimal pilih 1 paket menu untuk membuat pre-order.");
  }

  const mergedItems = new Map<number, number>();
  for (const item of input.items) {
    const pkgId = validatePositiveInt(item.packageId, "Paket menu", 1);
    const qty = validatePositiveInt(item.qty, "Jumlah box", 1, 5000);
    mergedItems.set(pkgId, (mergedItems.get(pkgId) ?? 0) + qty);
  }

  const createdId = await db.transaction(async (tx) => {
    const settingsRes = await tx.query<{ daily_capacity_boxes: number; min_dp_percent: number }>(
      "SELECT daily_capacity_boxes, min_dp_percent FROM kitchen_settings WHERE id = 1"
    );
    const settings = settingsRes.rows[0];

    const pkgIds = Array.from(mergedItems.keys());
    const pkgRes = await tx.query<{
      id: number;
      name: string;
      price_idr: number;
      min_order_qty: number;
      is_active: boolean;
    }>(
      `SELECT id, name, price_idr, min_order_qty, is_active
       FROM menu_packages WHERE id = ANY($1::int[])`,
      [pkgIds]
    );
    const pkgMap = new Map(pkgRes.rows.map((p) => [p.id, p]));

    let totalBoxes = 0;
    let totalIdr = 0;
    const resolvedItems: Array<{
      packageId: number;
      name: string;
      qty: number;
      unitPriceIdr: number;
      subtotalIdr: number;
    }> = [];

    for (const [pkgId, qty] of mergedItems.entries()) {
      const pkg = pkgMap.get(pkgId);
      if (!pkg || !pkg.is_active) {
        throw new ValidationError(`Paket menu #${pkgId} tidak tersedia atau nonaktif.`);
      }
      if (qty < pkg.min_order_qty) {
        throw new ValidationError(
          `Jumlah pesanan untuk ${pkg.name} minimal ${pkg.min_order_qty} box.`
        );
      }
      const subtotalIdr = qty * pkg.price_idr;
      totalBoxes += qty;
      totalIdr += subtotalIdr;
      resolvedItems.push({
        packageId: pkgId,
        name: pkg.name,
        qty,
        unitPriceIdr: pkg.price_idr,
        subtotalIdr,
      });
    }

    const capRes = await tx.query<{ used: string }>(
      `SELECT COALESCE(SUM(total_boxes), 0)::text AS used
       FROM catering_orders
       WHERE delivery_date = $1::date AND status <> 'DIBATALKAN'`,
      [deliveryDate]
    );
    const usedBoxes = Number(capRes.rows[0]?.used ?? 0);
    if (usedBoxes + totalBoxes > settings.daily_capacity_boxes) {
      const sisa = Math.max(0, settings.daily_capacity_boxes - usedBoxes);
      throw new ConflictError(
        `Kapasitas dapur tanggal ${deliveryDate} tidak mencukupi (tersisa ${sisa} box dari batas ${settings.daily_capacity_boxes} box).`
      );
    }

    let initialPaymentAmount = 0;
    let initialPaymentMethod: PaymentMethod = "TRANSFER";
    if (input.initialPayment && input.initialPayment.amountIdr > 0) {
      initialPaymentAmount = validatePositiveInt(
        input.initialPayment.amountIdr,
        "Nominal DP awal",
        1,
        totalIdr
      );
      initialPaymentMethod = input.initialPayment.method;
      if (!["TUNAI", "QRIS", "TRANSFER"].includes(initialPaymentMethod)) {
        throw new ValidationError("Metode pembayaran harus TUNAI, QRIS, atau TRANSFER.");
      }
    }

    const minDpIdr = calculateMinDpIdr(totalIdr, settings.min_dp_percent);
    const initialStatus: OrderStatus =
      initialPaymentAmount >= minDpIdr ? "TERJADWAL" : "MENUNGGU_DP";

    const seqRes = await tx.query<{ next_id: string }>(
      "SELECT (COALESCE(MAX(id), 0) + 1)::text AS next_id FROM catering_orders"
    );
    const seqNum = Number(seqRes.rows[0].next_id);
    const yyMmDd = deliveryDate.slice(2).replace(/-/g, "");
    const orderCode = `PO-${yyMmDd}-${String(seqNum).padStart(2, "0")}`;

    const insertRes = await tx.query<{ id: number }>(
      `INSERT INTO catering_orders
        (order_code, customer_name, institution_name, customer_phone, delivery_address, delivery_date, delivery_time, notes, status, total_boxes, total_idr)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        orderCode,
        customerName,
        institutionName,
        customerPhone,
        deliveryAddress,
        deliveryDate,
        deliveryTime,
        notes,
        initialStatus,
        totalBoxes,
        totalIdr,
      ]
    );
    const orderId = insertRes.rows[0].id;

    for (const item of resolvedItems) {
      await tx.query(
        `INSERT INTO order_items (order_id, package_id, package_name_snapshot, qty, unit_price_idr, subtotal_idr)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.packageId, item.name, item.qty, item.unitPriceIdr, item.subtotalIdr]
      );
    }

    if (initialPaymentAmount > 0) {
      const kind: PaymentKind = initialPaymentAmount >= totalIdr ? "PELUNASAN" : "DP";
      await tx.query(
        `INSERT INTO order_payments (order_id, amount_idr, method, kind, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          orderId,
          initialPaymentAmount,
          initialPaymentMethod,
          kind,
          String(input.initialPayment?.note ?? "Pembayaran awal").slice(0, 200),
        ]
      );
    }

    return orderId;
  });

  return getOrderById(db, createdId);
}

export async function recordPayment(
  db: PGlite,
  orderId: number,
  input: RecordPaymentInput
): Promise<CateringOrder> {
  const amountIdr = validatePositiveInt(input.amountIdr, "Nominal pembayaran", 1);
  if (!["TUNAI", "QRIS", "TRANSFER"].includes(input.method)) {
    throw new ValidationError("Metode pembayaran wajib TUNAI, QRIS, atau TRANSFER.");
  }
  if (!["DP", "PELUNASAN"].includes(input.kind)) {
    throw new ValidationError("Jenis pembayaran wajib DP atau PELUNASAN.");
  }
  const note = String(input.note ?? "").trim().slice(0, 200);

  await db.transaction(async (tx) => {
    const settingsRes = await tx.query<{ min_dp_percent: number }>(
      "SELECT min_dp_percent FROM kitchen_settings WHERE id = 1"
    );
    const minDpPercent = settingsRes.rows[0].min_dp_percent;

    const ordRes = await tx.query<{ id: number; status: OrderStatus; total_idr: number }>(
      "SELECT id, status, total_idr FROM catering_orders WHERE id = $1",
      [orderId]
    );
    if (ordRes.rows.length === 0) {
      throw new NotFoundError("Pre-order tidak ditemukan.");
    }
    const order = ordRes.rows[0];
    if (order.status === "DIBATALKAN" || order.status === "SELESAI_DIKIRIM") {
      throw new ConflictError(`Pre-order berstatus ${order.status} tidak dapat menerima pembayaran baru.`);
    }

    const paidRes = await tx.query<{ paid: string }>(
      "SELECT COALESCE(SUM(amount_idr), 0)::text AS paid FROM order_payments WHERE order_id = $1",
      [orderId]
    );
    const currentPaid = Number(paidRes.rows[0]?.paid ?? 0);
    const remaining = order.total_idr - currentPaid;
    if (amountIdr > remaining) {
      throw new ConflictError(
        `Nominal pembayaran melebihi sisa tagihan (${remaining}).`
      );
    }

    await tx.query(
      `INSERT INTO order_payments (order_id, amount_idr, method, kind, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, amountIdr, input.method, input.kind, note]
    );

    const newPaid = currentPaid + amountIdr;
    const minDpIdr = calculateMinDpIdr(order.total_idr, minDpPercent);
    if (order.status === "MENUNGGU_DP" && newPaid >= minDpIdr) {
      await tx.query(
        "UPDATE catering_orders SET status = 'TERJADWAL', updated_at = NOW() WHERE id = $1",
        [orderId]
      );
    } else {
      await tx.query("UPDATE catering_orders SET updated_at = NOW() WHERE id = $1", [orderId]);
    }
  });

  return getOrderById(db, orderId);
}

export async function transitionOrderStatus(
  db: PGlite,
  orderId: number,
  toStatus: OrderStatus
): Promise<CateringOrder> {
  await db.transaction(async (tx) => {
    const settingsRes = await tx.query<{ min_dp_percent: number }>(
      "SELECT min_dp_percent FROM kitchen_settings WHERE id = 1"
    );
    const minDpPercent = settingsRes.rows[0].min_dp_percent;

    const ordRes = await tx.query<{ id: number; status: OrderStatus; total_idr: number }>(
      "SELECT id, status, total_idr FROM catering_orders WHERE id = $1",
      [orderId]
    );
    if (ordRes.rows.length === 0) {
      throw new NotFoundError("Pre-order tidak ditemukan.");
    }
    const order = ordRes.rows[0];

    const paidRes = await tx.query<{ paid: string }>(
      "SELECT COALESCE(SUM(amount_idr), 0)::text AS paid FROM order_payments WHERE order_id = $1",
      [orderId]
    );
    const itemRes = await tx.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM order_items WHERE order_id = $1",
      [orderId]
    );

    assertTransitionAllowed({
      fromStatus: order.status,
      toStatus,
      totalIdr: order.total_idr,
      paidIdr: Number(paidRes.rows[0]?.paid ?? 0),
      minDpPercent,
      itemCount: Number(itemRes.rows[0]?.cnt ?? 0),
    });

    await tx.query(
      "UPDATE catering_orders SET status = $1, updated_at = NOW() WHERE id = $2",
      [toStatus, orderId]
    );
  });

  return getOrderById(db, orderId);
}

export async function getShoppingList(
  db: PGlite,
  fromDate: string,
  toDate: string
): Promise<ShoppingListItem[]> {
  const from = validateDeliveryDate(fromDate);
  const to = validateDeliveryDate(toDate);
  if (from > to) {
    throw new ValidationError("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.");
  }

  const res = await db.query<{
    order_status: OrderStatus;
    item_qty: number;
    ingredient_name: string;
    category: IngredientCategory;
    qty_per_box: number;
    unit: string;
    estimated_unit_cost_idr: number;
  }>(
    `SELECT co.status AS order_status,
            oi.qty AS item_qty,
            pi.ingredient_name,
            pi.category,
            pi.qty_per_box,
            pi.unit,
            pi.estimated_unit_cost_idr
     FROM catering_orders co
     JOIN order_items oi ON oi.order_id = co.id
     JOIN package_ingredients pi ON pi.package_id = oi.package_id
     WHERE co.delivery_date BETWEEN $1::date AND $2::date`,
    [from, to]
  );

  return aggregateShoppingList(
    res.rows.map((r) => ({
      orderStatus: r.order_status,
      itemQty: r.item_qty,
      ingredientName: r.ingredient_name,
      category: r.category,
      qtyPerBox: r.qty_per_box,
      unit: r.unit,
      estimatedUnitCostIdr: r.estimated_unit_cost_idr,
    }))
  );
}

export async function getCashRecap(db: PGlite): Promise<CashRecap> {
  const methodRes = await db.query<{ method: PaymentMethod; total: string }>(
    `SELECT op.method, COALESCE(SUM(op.amount_idr), 0)::text AS total
     FROM order_payments op
     JOIN catering_orders co ON co.id = op.order_id
     WHERE co.status <> 'DIBATALKAN'
     GROUP BY op.method`
  );

  const byMethod: Record<PaymentMethod, number> = {
    TUNAI: 0,
    QRIS: 0,
    TRANSFER: 0,
  };
  let totalCollectedIdr = 0;
  for (const r of methodRes.rows) {
    const val = Number(r.total);
    byMethod[r.method] = val;
    totalCollectedIdr += val;
  }

  const orderTotalsRes = await db.query<{ active_cnt: string; total_tagihan: string }>(
    `SELECT COUNT(*)::text AS active_cnt,
            COALESCE(SUM(total_idr), 0)::text AS total_tagihan
     FROM catering_orders
     WHERE status <> 'DIBATALKAN'`
  );
  const activeOrderCount = Number(orderTotalsRes.rows[0]?.active_cnt ?? 0);
  const totalTagihan = Number(orderTotalsRes.rows[0]?.total_tagihan ?? 0);
  const totalReceivableIdr = Math.max(0, totalTagihan - totalCollectedIdr);

  return {
    totalCollectedIdr,
    totalReceivableIdr,
    activeOrderCount,
    byMethod,
  };
}

export async function updateSettings(
  db: PGlite,
  input: UpdateSettingsInput
): Promise<PublicSettings> {
  const current = await getSettingsRow(db);
  const dailyCapacityBoxes =
    input.dailyCapacityBoxes !== undefined
      ? validatePositiveInt(input.dailyCapacityBoxes, "Kapasitas harian", 10, 10_000)
      : current.daily_capacity_boxes;
  const minDpPercent =
    input.minDpPercent !== undefined
      ? validatePositiveInt(input.minDpPercent, "Persentase minimal DP", 1, 100)
      : current.min_dp_percent;
  const businessName =
    input.businessName !== undefined
      ? validateNonEmptyText(input.businessName, "Nama usaha", 120)
      : current.business_name;
  const whatsappNumber =
    input.whatsappNumber !== undefined
      ? normalizePhone(input.whatsappNumber)
      : current.whatsapp_number;
  const addressArea =
    input.addressArea !== undefined
      ? validateNonEmptyText(input.addressArea, "Area layanan", 160)
      : current.address_area;

  let salt = current.admin_pin_salt;
  let hash = current.admin_pin_hash;
  if (input.newPin !== undefined && input.newPin.trim() !== "") {
    const hashed = hashPin(input.newPin);
    salt = hashed.salt;
    hash = hashed.hash;
  }

  await db.query(
    `UPDATE kitchen_settings
     SET business_name = $1,
         whatsapp_number = $2,
         address_area = $3,
         daily_capacity_boxes = $4,
         min_dp_percent = $5,
         admin_pin_salt = $6,
         admin_pin_hash = $7,
         updated_at = NOW()
     WHERE id = 1`,
    [businessName, whatsappNumber, addressArea, dailyCapacityBoxes, minDpPercent, salt, hash]
  );

  return getPublicSettings(db);
}

export async function createMenuPackage(
  db: PGlite,
  input: CreateMenuPackageInput
): Promise<MenuPackage> {
  const code = validateNonEmptyText(input.code, "Kode paket", 32).toUpperCase();
  const name = validateNonEmptyText(input.name, "Nama paket", 120);
  if (!["NASI_KOTAK", "SNACK_BOX", "TUMPENG_PRASMANAN"].includes(input.category)) {
    throw new ValidationError("Kategori paket tidak valid.");
  }
  const description = validateNonEmptyText(input.description, "Deskripsi paket", 400);
  const unitLabel = validateNonEmptyText(input.unitLabel || "box", "Satuan paket", 24);
  const priceIdr = validatePositiveInt(input.priceIdr, "Harga paket", 1000);
  const minOrderQty = validatePositiveInt(input.minOrderQty, "Minimal order", 1, 1000);

  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new ValidationError("Paket wajib memiliki minimal 1 komponen bahan/kemasan BOM.");
  }

  const pkgId = await db.transaction(async (tx) => {
    const dup = await tx.query<{ id: number }>(
      "SELECT id FROM menu_packages WHERE UPPER(code) = $1",
      [code]
    );
    if (dup.rows.length > 0) {
      throw new ConflictError(`Kode paket ${code} sudah dipakai.`);
    }

    const res = await tx.query<{ id: number }>(
      `INSERT INTO menu_packages (code, name, category, description, unit_label, price_idr, min_order_qty, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id`,
      [code, name, input.category, description, unitLabel, priceIdr, minOrderQty]
    );
    const insertedId = res.rows[0].id;

    for (const ing of input.ingredients) {
      const ingName = validateNonEmptyText(ing.ingredientName, "Nama bahan", 120);
      if (!["BAHAN_BAKU", "KEMASAN"].includes(ing.category)) {
        throw new ValidationError("Kategori bahan harus BAHAN_BAKU atau KEMASAN.");
      }
      const qtyPerBox = validatePositiveInt(ing.qtyPerBox, "Takaran per box", 1);
      const unit = validateNonEmptyText(ing.unit, "Satuan bahan", 24);
      const cost = validatePositiveInt(ing.estimatedUnitCostIdr ?? 0, "Estimasi harga bahan", 0);

      await tx.query(
        `INSERT INTO package_ingredients (package_id, ingredient_name, category, qty_per_box, unit, estimated_unit_cost_idr)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [insertedId, ingName, ing.category, qtyPerBox, unit, cost]
      );
    }

    return insertedId;
  });

  const all = await listMenuPackages(db, { includeInactive: true });
  return all.find((p) => p.id === pkgId)!;
}

export async function toggleMenuPackage(
  db: PGlite,
  packageId: number,
  isActive: boolean
): Promise<MenuPackage> {
  const res = await db.query<{ id: number }>(
    "UPDATE menu_packages SET is_active = $1 WHERE id = $2 RETURNING id",
    [isActive, packageId]
  );
  if (res.rows.length === 0) {
    throw new NotFoundError("Paket menu tidak ditemukan.");
  }
  const all = await listMenuPackages(db, { includeInactive: true });
  return all.find((p) => p.id === packageId)!;
}
