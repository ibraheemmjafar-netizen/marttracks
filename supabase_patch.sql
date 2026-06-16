-- ============================================================
-- MartTrack v3 — COMPLETE SQL Patch
-- Run this ONCE in your Supabase SQL Editor.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- SECTION 1: Core tables (create if they don't exist yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'cashier',
  pin  text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  category            text NOT NULL DEFAULT 'Other',
  buy_price           numeric NOT NULL DEFAULT 0,
  sell_price          numeric NOT NULL DEFAULT 0,
  open_stock          numeric NOT NULL DEFAULT 0,
  current_stock       numeric NOT NULL DEFAULT 0,
  stock_type          text NOT NULL DEFAULT 'units',
  units_per_carton    int NOT NULL DEFAULT 1,
  low_stock_threshold int NOT NULL DEFAULT 5,
  is_fridge_item      boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id   uuid REFERENCES users(id),
  sale_date    date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric NOT NULL DEFAULT 0,
  is_voided    boolean NOT NULL DEFAULT false,
  voided_at    timestamptz,
  voided_by    uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES sale_transactions(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id),
  quantity_units numeric NOT NULL DEFAULT 0,
  unit_price     numeric NOT NULL DEFAULT 0,
  total_price    numeric NOT NULL DEFAULT 0,
  sale_date      date NOT NULL DEFAULT CURRENT_DATE,
  user_id        uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description  text NOT NULL,
  amount       numeric NOT NULL DEFAULT 0,
  category     text NOT NULL DEFAULT 'Other',
  recorded_by  uuid REFERENCES users(id),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone         text,
  amount_owed   numeric NOT NULL DEFAULT 0,
  recorded_by   uuid REFERENCES users(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  phone      text,
  email      text,
  address    text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid REFERENCES products(id),
  quantity       numeric NOT NULL DEFAULT 0,
  recorded_by    uuid REFERENCES users(id),
  new_buy_price  numeric,
  new_sell_price numeric,
  restock_date   date NOT NULL DEFAULT CURRENT_DATE,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid REFERENCES products(id),
  old_buy_price  numeric NOT NULL DEFAULT 0,
  old_sell_price numeric NOT NULL DEFAULT 0,
  new_buy_price  numeric NOT NULL DEFAULT 0,
  new_sell_price numeric NOT NULL DEFAULT 0,
  changed_by     uuid REFERENCES users(id),
  change_date    date NOT NULL DEFAULT CURRENT_DATE,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid REFERENCES products(id),
  counted_stock numeric NOT NULL DEFAULT 0,
  counted_by    uuid REFERENCES users(id),
  count_date    date NOT NULL DEFAULT CURRENT_DATE,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: Add missing columns to EXISTING tables
-- (safe: IF NOT EXISTS means no error if column already there)
-- ============================================================

-- users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS open_stock          numeric NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_type          text NOT NULL DEFAULT 'units';
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_carton    int NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold int NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_fridge_item      boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active              boolean NOT NULL DEFAULT true;

-- sale_transactions table
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS is_voided  boolean NOT NULL DEFAULT false;
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS voided_at  timestamptz;
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS voided_by  uuid REFERENCES users(id);

-- sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES sale_transactions(id) ON DELETE CASCADE;

-- ============================================================
-- SECTION 3: Backfill defaults on existing rows
-- ============================================================

UPDATE products          SET active    = true  WHERE active IS NULL;
UPDATE users             SET active    = true  WHERE active IS NULL;
UPDATE sale_transactions SET is_voided = false WHERE is_voided IS NULL;
UPDATE products          SET open_stock = current_stock WHERE open_stock = 0 AND current_stock > 0;

-- ============================================================
-- SECTION 4: Performance indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sale_transactions_sale_date ON sale_transactions(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_is_voided ON sale_transactions(is_voided);
CREATE INDEX IF NOT EXISTS idx_sales_transaction_id        ON sales(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id            ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_restocks_restock_date       ON restocks(restock_date);
CREATE INDEX IF NOT EXISTS idx_price_history_change_date   ON price_history(change_date);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date       ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_credits_customer_name       ON credits(customer_name);

-- ============================================================
-- DONE! All tables and columns are now in place.
-- ============================================================
