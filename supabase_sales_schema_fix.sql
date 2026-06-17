-- ============================================================
-- MartTrack — SALES TABLE SCHEMA ALIGNMENT FIX
-- Your "sales" table has old column names (quantity, sell_price,
-- buy_price) left over from an earlier version of the app. The
-- code now deployed on marttrack.vercel.app inserts into different
-- column names (quantity_units, unit_price, total_price,
-- transaction_id). Postgres rejects every insert because the old
-- required columns (quantity, sell_price, buy_price) are NOT NULL
-- with no default, and the new code never sends them.
--
-- This script:
--   1. Adds the new columns the app actually uses
--   2. Copies any existing data across so nothing is lost
--   3. Removes the NOT NULL constraint from the old columns so
--      they stop blocking new inserts (keeps the columns + data,
--      just makes them optional going forward)
-- Safe to run multiple times.
-- ============================================================

-- 1. Add every column the live app code inserts into
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES sale_transactions(id) ON DELETE CASCADE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS quantity_units numeric;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price     numeric;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_price    numeric;

-- 2. Copy old data into the new columns (only affects existing rows, if any)
UPDATE sales SET quantity_units = quantity   WHERE quantity_units IS NULL AND quantity   IS NOT NULL;
UPDATE sales SET unit_price     = sell_price WHERE unit_price     IS NULL AND sell_price IS NOT NULL;
UPDATE sales SET total_price    = quantity * sell_price WHERE total_price IS NULL AND quantity IS NOT NULL AND sell_price IS NOT NULL;

-- 3. Drop the NOT NULL requirement on the old columns so they stop
--    blocking inserts from the new code (columns themselves are kept,
--    not deleted — no data loss, fully reversible)
ALTER TABLE sales ALTER COLUMN quantity   DROP NOT NULL;
ALTER TABLE sales ALTER COLUMN sell_price DROP NOT NULL;
ALTER TABLE sales ALTER COLUMN buy_price  DROP NOT NULL;

-- 4. Give the new columns sensible defaults too, as a safety net
ALTER TABLE sales ALTER COLUMN quantity_units SET DEFAULT 0;
ALTER TABLE sales ALTER COLUMN unit_price     SET DEFAULT 0;
ALTER TABLE sales ALTER COLUMN total_price    SET DEFAULT 0;

-- 5. Force Supabase's API layer to recognize the changes immediately
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE. Refresh marttrack.vercel.app and try a sale again.
-- ============================================================
