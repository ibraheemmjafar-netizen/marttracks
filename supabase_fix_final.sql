-- ============================================================
-- MartTrack — DEFINITIVE FIX (Sales insert + Credits RLS + everything else)
-- Run this ONCE in Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

-- ----------------------------------------------------------------
-- PART 1 — Create every table the app needs (no-op if it already exists)
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- PART 2 — Add every column the app needs onto tables that ALREADY
-- existed with a different/older shape (this is the actual bug fix
-- for the "Failed to record transaction" error: cashier_id was
-- never added to your real sale_transactions table)
-- ----------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE products ADD COLUMN IF NOT EXISTS open_stock          numeric NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_type          text NOT NULL DEFAULT 'units';
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_carton    int NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold int NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_fridge_item      boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active              boolean NOT NULL DEFAULT true;

-- THE KEY FIX: cashier_id was missing from the real table
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS cashier_id uuid REFERENCES users(id);
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS is_voided  boolean NOT NULL DEFAULT false;
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS voided_at  timestamptz;
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS voided_by  uuid REFERENCES users(id);
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS sale_date  date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES sale_transactions(id) ON DELETE CASCADE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS quantity_units numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price     numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_price    numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_date      date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category    text NOT NULL DEFAULT 'Other';

ALTER TABLE credits ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES users(id);
ALTER TABLE credits ADD COLUMN IF NOT EXISTS notes       text;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email   text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes   text;

-- ----------------------------------------------------------------
-- PART 3 — Backfill sensible defaults on existing rows
-- ----------------------------------------------------------------
UPDATE products          SET active     = true  WHERE active     IS NULL;
UPDATE users              SET active     = true  WHERE active     IS NULL;
UPDATE sale_transactions  SET is_voided  = false WHERE is_voided  IS NULL;
UPDATE products           SET open_stock = current_stock WHERE open_stock = 0 AND current_stock > 0;

-- ----------------------------------------------------------------
-- PART 4 — THE ROW-LEVEL SECURITY FIX
-- This is the OTHER bug: "new row violates row-level security
-- policy for table 'credits'". RLS is ON for every table in your
-- project but several tables (credits, suppliers, restocks,
-- price_history, stock_counts) never got a policy created, so
-- Postgres silently blocks every insert/update/select.
--
-- This app has no real backend auth (PIN login is custom, not
-- Supabase Auth), so the correct, safe policy here is "allow
-- everything through the anon key" — exactly like the other
-- tables (users, products, sales, expenses) already have.
-- ----------------------------------------------------------------

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales             ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE restocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all users"             ON users;
DROP POLICY IF EXISTS "allow all products"          ON products;
DROP POLICY IF EXISTS "allow all sale_transactions" ON sale_transactions;
DROP POLICY IF EXISTS "allow all sales"             ON sales;
DROP POLICY IF EXISTS "allow all expenses"          ON expenses;
DROP POLICY IF EXISTS "allow all credits"           ON credits;
DROP POLICY IF EXISTS "allow all suppliers"         ON suppliers;
DROP POLICY IF EXISTS "allow all restocks"          ON restocks;
DROP POLICY IF EXISTS "allow all price_history"     ON price_history;
DROP POLICY IF EXISTS "allow all stock_counts"      ON stock_counts;

CREATE POLICY "allow all users"             ON users             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all products"          ON products          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all sale_transactions" ON sale_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all sales"             ON sales             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all expenses"          ON expenses          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all credits"           ON credits           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all suppliers"         ON suppliers         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all restocks"          ON restocks          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all price_history"     ON price_history     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all stock_counts"      ON stock_counts      FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- PART 5 — Force Supabase's API layer (PostgREST) to reload its
-- schema cache immediately, instead of waiting ~60 seconds.
-- This is what fixes "Could not find the column... in schema cache"
-- errors right away.
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- PART 6 — Indexes for performance
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sale_transactions_sale_date ON sale_transactions(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_is_voided ON sale_transactions(is_voided);
CREATE INDEX IF NOT EXISTS idx_sales_transaction_id        ON sales(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id            ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_restocks_restock_date       ON restocks(restock_date);
CREATE INDEX IF NOT EXISTS idx_price_history_change_date   ON price_history(change_date);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date       ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_credits_customer_name       ON credits(customer_name);

-- ============================================================
-- DONE. After this runs, refresh marttrack.vercel.app and:
--   1. Sales should record successfully (cashier_id now exists)
--   2. Credits should save successfully (RLS policy now exists)
--   3. Suppliers, Restocks, Price History, Stock Counts will all
--      work the same way for the same reason
-- ============================================================
