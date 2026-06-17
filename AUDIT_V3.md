# MartTrack — Full System Audit (every page, every calculation)

This pass read all 11 pages line by line, hand-verified every profit/stock
calculation, and fixed everything found. Nothing here was guessed — each
item below was traced to the exact line causing it before being fixed.

## Bugs found and fixed

### 1. Wrong "today" for roughly the first hour after midnight (all pages)
`todayStr()` used `new Date().toISOString().split("T")[0]`, which converts
to UTC first. Nigeria is UTC+1, so between 12:00am–12:59am local time, this
returned **yesterday's date**. Every sale, expense, or restock logged in
that hour was filed under the wrong day — silently breaking End of Day
totals, "Today's Transactions," and daily reports during that window, every
single day. Fixed by building the date string from local calendar
components instead. Same fix applied to the equivalent "first day of this
month" and "7 days ago" calculations in Dashboard, Expenses, and Reports,
which had the identical bug pattern.

### 2. Profit silently changes after a price update (Dashboard + Reports)
Cost of goods sold was calculated using the product's *current* buy price
for every sale that month — even sales from days or weeks earlier. If a
restock changed the buy price mid-month, the Dashboard and Reports would
retroactively recalculate last week's profit using today's price, with no
indication this happened. Fixed by capturing the actual buy price at the
moment of each sale (`cost_price`) and using that locked-in value for all
profit math going forward. Old sales recorded before this fix correctly
fall back to the current price (the only option available for that
historical data), but every sale from now on is exactly accurate forever.

### 3. Voided sales never flagged in the `sales` table itself (SalesEntry)
Voiding a transaction correctly flagged the parent `sale_transactions` row
and restored stock, but the individual `sales` rows underneath it were
never marked voided. Today this causes no visible problem, because
Dashboard and Reports always join through `sale_transactions` and filter
there — but any future feature that queries `sales` directly (a "units sold
today" widget, a stock-discrepancy check, anything) would silently count a
voided sale as real. Fixed by also flagging the `sales` rows on void, so
the table is safe by default rather than safe by convention.

### 4. Stock updates could race and silently lose units (SalesEntry + Inventory)
Both completing a sale and voiding a transaction adjusted stock by reading
`current_stock`, then writing back `current_stock ± quantity` as two
separate steps. If two sales of the same product happened close enough
together, both could read the same starting number before either write
landed, and one deduction would be lost. Fixed by adding a Postgres
function (`adjust_stock`) that does the read-and-write as one atomic
database operation, and switching every stock change in the app to call
it instead.

### 5. Paid-off customers permanently disappeared (Credits)
The customer list only ever showed people who *currently* owe money
(`amount_owed > 0`). The moment someone paid off their full balance, they
vanished from the list entirely — there was no way to see who has a track
record of paying back, and adding new credit for that same person later
would treat them as a brand-new customer with no history. Fixed by loading
every customer who's ever had credit recorded, with a "Settled" badge for
anyone at ₦0 and a toggle to hide them if the list gets long.

### 6. Deleting an expense left no trace at all (Expenses)
The delete button was a plain confirm + hard delete, with nothing recorded
about who deleted what or why. Given the entire point of this system is
"the owner needs to know if staff are fabricating numbers," an
untraceable delete button on financial records undermines that directly —
someone could log a fake expense and quietly remove it later, or delete a
real one to hide where cash went. Fixed by requiring a typed reason before
any delete, and logging the deletion itself (description, amount, and who
removed it) before the row is actually removed.

### 7. Editing a product's price left no audit trail (Inventory)
Price changes made through the **Restock** flow were correctly logged to
Price History — but the same change made through the **Edit** button on a
product bypassed that completely. Two different ways to change the exact
same number, only one of them tracked. Fixed so editing a product now logs
to Price History too whenever the buy or sell price actually changes.

### 8. Sidebar hiding a page ≠ actually protecting that page (App.tsx)
`Layout.tsx` correctly hides buttons like "Staff" and "Reports" from roles
that shouldn't see them, but `App.tsx`'s page renderer had no awareness of
roles at all — it would render any page for any logged-in user if the
`page` state ever pointed there, regardless of how it got there. Today
that's not exploitable through the visible UI, but it's a landmine: any
future deep link, stray function call, or browser back/forward could land
on a forbidden page with zero resistance. Fixed by adding an explicit
role-allowlist check that runs before rendering any page, independent of
what the sidebar happens to show.

### 9. No warning when two staff share a PIN (Users)
Login is identity-first (pick your name, then enter your PIN), so a shared
PIN can't let one person silently log in *as* someone else by accident —
but it does weaken "every logged action is reliably one specific person."
Added a soft warning (not a hard block, since some shops may genuinely
want a shared till PIN) when saving a PIN that's already in active use by
someone else.

### 10. "Clear Data" silently spared customer credit, with no explanation (ResetData)
The reset feature correctly leaves customer credit balances untouched
when clearing test/operational data — almost certainly the right call,
since you wouldn't want to accidentally erase that a real customer owes
money. But nowhere did the page actually say this, so it read as an
oversight rather than a deliberate choice. Added explicit wording in the
warning banner, the confirmation step, and the success screen.

## What did NOT need fixing (checked and confirmed correct)

- Login PIN matching, session restore/validation in `App.tsx`
- Basket math, stock-availability checks in SalesEntry
- Supplier debt tracking (no profit-calculation involvement, simple CRUD)
- Expense category totals, percentage breakdowns
- `formatNaira` currency formatting
- RLS policies and column alignment (fixed in the previous session)

## Files changed in this pass

```
src/utils.ts             — timezone-safe date helpers (todayStr, monthStartStr, daysAgoStr)
src/supabase.ts          — added cost_price + is_voided to SaleItem type, active to Product type
src/App.tsx              — added real role-based page access control
src/pages/Dashboard.tsx  — use stored cost_price, use monthStartStr
src/pages/Reports.tsx    — use stored cost_price, use monthStartStr/daysAgoStr
src/pages/Expenses.tsx   — use monthStartStr, require reason + log expense deletions
src/pages/SalesEntry.tsx — atomic stock RPC, flag sales rows on void, capture cost_price
src/pages/Inventory.tsx  — atomic stock RPC for restock, log price changes made via Edit,
                           active/inactive product filter, clearer carton vs unit pricing
src/pages/Credits.tsx    — show full customer history including settled accounts
src/pages/Users.tsx      — warn on duplicate PIN
src/pages/ResetData.tsx  — explicitly explain why credits are preserved
```

## SQL to run

Run **`supabase_v3_fixes.sql`** in Supabase SQL Editor (one new file, covers
both the atomic stock function and the new `cost_price`/`is_voided` columns
on `sales`). Safe to run alongside everything from the previous session.

After running it, redeploy this code and hard-refresh the live site.
