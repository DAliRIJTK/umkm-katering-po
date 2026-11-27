import type { PGlite } from "@electric-sql/pglite";
import { hashPin } from "../domain/auth";
import type {
  IngredientCategory,
  OrderStatus,
  PackageCategory,
  PaymentKind,
  PaymentMethod,
} from "../domain/types";

export async function seedDatabaseIfEmpty(db: PGlite): Promise<void> {
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
        ["Sendok & Tisu", "KEMASAN", 1, "set", 400],
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

  await db.query(
    "SELECT setval('order_code_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM catering_orders), 1), true)"
  );
}
