-- Skema PostgreSQL 16 Produksi untuk DapurRantang (identik dengan PGlite lokal)

CREATE TABLE IF NOT EXISTS kitchen_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name VARCHAR(120) NOT NULL,
  whatsapp_number VARCHAR(32) NOT NULL,
  address_area VARCHAR(160) NOT NULL,
  daily_capacity_boxes INTEGER NOT NULL CHECK (daily_capacity_boxes > 0),
  min_dp_percent INTEGER NOT NULL CHECK (min_dp_percent BETWEEN 1 AND 100),
  admin_pin_salt VARCHAR(64) NOT NULL,
  admin_pin_hash VARCHAR(256) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_packages (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN ('NASI_KOTAK', 'SNACK_BOX', 'TUMPENG_PRASMANAN')),
  description TEXT NOT NULL,
  unit_label VARCHAR(24) NOT NULL DEFAULT 'box',
  price_idr INTEGER NOT NULL CHECK (price_idr > 0),
  min_order_qty INTEGER NOT NULL CHECK (min_order_qty > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package_ingredients (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES menu_packages(id) ON DELETE CASCADE,
  ingredient_name VARCHAR(120) NOT NULL,
  category VARCHAR(24) NOT NULL CHECK (category IN ('BAHAN_BAKU', 'KEMASAN')),
  qty_per_box INTEGER NOT NULL CHECK (qty_per_box > 0),
  unit VARCHAR(24) NOT NULL,
  estimated_unit_cost_idr INTEGER NOT NULL DEFAULT 0 CHECK (estimated_unit_cost_idr >= 0)
);

CREATE TABLE IF NOT EXISTS catering_orders (
  id SERIAL PRIMARY KEY,
  order_code VARCHAR(32) NOT NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  institution_name VARCHAR(120) NOT NULL DEFAULT '',
  customer_phone VARCHAR(32) NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_time VARCHAR(10) NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL CHECK (status IN (
    'MENUNGGU_DP', 'TERJADWAL', 'DIPRODUKSI', 'SIAP_KIRIM', 'SELESAI_DIKIRIM', 'DIBATALKAN'
  )),
  total_boxes INTEGER NOT NULL CHECK (total_boxes >= 0),
  total_idr INTEGER NOT NULL CHECK (total_idr >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES catering_orders(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES menu_packages(id),
  package_name_snapshot VARCHAR(120) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_idr INTEGER NOT NULL CHECK (unit_price_idr > 0),
  subtotal_idr INTEGER NOT NULL CHECK (subtotal_idr > 0)
);

CREATE TABLE IF NOT EXISTS order_payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES catering_orders(id) ON DELETE CASCADE,
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  method VARCHAR(16) NOT NULL CHECK (method IN ('TUNAI', 'QRIS', 'TRANSFER')),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('DP', 'PELUNASAN')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note VARCHAR(200) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ingredients_package ON package_ingredients(package_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON catering_orders(delivery_date, status);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON order_payments(order_id, paid_at);
