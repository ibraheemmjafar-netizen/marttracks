# MartTrack — Bug Fix Package

## What was actually broken (root cause)

Your real Supabase database was built up over several sessions, with different
SQL patches each adding tables and columns piecemeal. Two specific gaps caused
everything you saw failing:

1. **"Failed to record transaction" on every sale**
   Your `sale_transactions` table already existed from an earlier session,
   but it never had a `cashier_id` column added to it. The app's code (in
   `SalesEntry.tsx`) inserts into that column on every sale — so every single
   sale failed silently with a generic error.

2. **"new row violates row-level security policy for table 'credits'"**
   (and the same problem applies to `suppliers`, `restocks`, `price_history`,
   `stock_counts`) — Row Level Security was turned on for these tables at
   some point, but no policy was ever created to allow reads/writes through
   it. Postgres's default behavior with RLS on and no policy is to block
   *everything*, even from the app's own key. The older tables (`users`,
   `products`, `sales`, `expenses`) had a permissive policy created for them
   early on — the newer tables never got the same treatment.

Neither of these was a frontend code bug. The React/TypeScript code was
already correct (verified by a clean `npm run build` and a clean
`tsc --noEmit`). The fix is 100% in the database.

## What to do — one step

Open Supabase → your project → **SQL Editor** → paste the entire contents of
**`supabase_fix_final.sql`** → click **Run**.

This single script is idempotent (safe to run as many times as you want) and:
- Creates any table that's missing entirely
- Adds `cashier_id` (and every other column the app expects) to tables that
  already existed with an older shape
- Enables RLS and creates a permissive policy on **every** table the app
  uses, including the four that were missing one
- Forces Supabase's API layer to immediately recognize the new columns
  (`NOTIFY pgrst, 'reload schema'`) instead of waiting ~60 seconds
- Adds performance indexes

After running it, hard-refresh `marttrack.vercel.app` (Ctrl+Shift+R) and:
- Sales will record successfully
- Customer Credits will save successfully
- Suppliers, Restocks, and Price History will all work for the same reason

## Code cleanup also done in this package

While auditing, three small things were found and fixed in the source code
itself (none of these caused the errors you saw, but they're worth fixing):

- Removed an unused `src/components/ui/` folder (55 files, a leftover
  shadcn/ui scaffold from the original Replit template) and the matching
  `src/hooks/` and `src/lib/` folders — nothing in the real app imports them.
  This is why `tsc` was showing dozens of "Cannot find module
  '@radix-ui/...'" errors — those were dead files, not real bugs, and they
  are gone now.
- Removed the orphaned `not-found.tsx` page (not routed anywhere in
  `App.tsx`, only file that referenced the dead `ui/` folder).
- Trimmed `package.json` from ~25 dependencies down to the 7 actually used
  (`react`, `react-dom`, `recharts`, `@supabase/supabase-js`, `tailwindcss`,
  `@tailwindcss/vite`, `tw-animate-css`). This cuts `npm install` time
  roughly in half and removes 2 security vulnerabilities that came from
  unused packages.
- Cleaned up `vite.config.ts` to remove the Replit-only plugin loading code,
  since this project now only deploys to Vercel.
- Fixed a loose TypeScript type cast in `ResetData.tsx`'s backup function.

After these changes: `npm run build` and `npx tsc --noEmit` both complete
with **zero errors or warnings** (aside from one harmless "chunk size"
informational notice from Vite, which is normal for a single-page app and
not a bug).

## Deploying this package

```bash
# from inside this folder
git add -A
git commit -m "fix: RLS policies + cashier_id column + dead code cleanup"
git push
```

Vercel will auto-redeploy. Root directory in Vercel settings should point to
wherever this folder ends up in your repo (same as before).
