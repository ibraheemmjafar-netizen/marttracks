-- ============================================================
-- MartTrack — Atomic Stock Adjustment (race-condition fix)
-- Run this once in Supabase SQL Editor. Safe to run multiple times.
--
-- WHY: the app previously did "read current_stock, then write
-- current_stock - quantity" as two separate steps. If two sales of
-- the same product happen within the same instant (two cashiers,
-- or one cashier double-tapping), both reads can see the same
-- starting number before either write lands, so one sale's stock
-- deduction gets silently lost. This function makes the read+write
-- a single atomic database operation, which Postgres guarantees
-- can never race against itself.
-- ============================================================

CREATE OR REPLACE FUNCTION adjust_stock(p_product_id uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  new_stock numeric;
BEGIN
  UPDATE products
  SET current_stock = GREATEST(0, current_stock + p_delta)
  WHERE id = p_product_id
  RETURNING current_stock INTO new_stock;

  RETURN new_stock;
END;
$$;

-- Allow the app's anon key to call this function (same access level
-- as the rest of the app, consistent with the permissive policies
-- already in place on every table).
GRANT EXECUTE ON FUNCTION adjust_stock(uuid, numeric) TO anon, authenticated;
-- ============================================================
-- MartTrack — Historical Cost Accuracy Fix
-- Run this once in Supabase SQL Editor. Safe to run multiple times.
--
-- WHY: profit calculations previously used the product's CURRENT
-- buy_price for every sale this month, even sales from weeks ago.
-- If a restock changes the buy price mid-month, that retroactively
-- and silently changes last week's calculated profit too — the
-- numbers shown today don't match what was true on the day of sale.
--
-- This adds a cost_price column that the app now fills in at the
-- moment of every sale, locking in that day's true buy price
-- forever. Existing/old sales (before this column existed) will
-- have cost_price = NULL, and the app correctly falls back to the
-- current product price only for those old rows — everything
-- recorded from now on will be exactly accurate.
-- ============================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS cost_price numeric;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sales_is_voided ON sales(is_voided);

NOTIFY pgrst, 'reload schema';
