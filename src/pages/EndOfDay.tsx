import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { AppUser } from "../supabase";
import { formatNaira, todayStr, formatFullDate } from "../utils";

interface Props { user: AppUser; }

interface CheckItem {
  id: string;
  label: string;
  done: boolean;
}

const CHECKLISTS: Record<string, CheckItem[]> = {
  cashier: [
    { id: "count_cash",     label: "Count total cash in till",             done: false },
    { id: "close_basket",   label: "Confirm all baskets are cleared",       done: false },
    { id: "record_sales",   label: "Ensure all sales are entered in system",done: false },
    { id: "credits",        label: "Record any goods given on credit",      done: false },
    { id: "vouch_void",     label: "Report any voided transactions to manager", done: false },
    { id: "lock_cashier",   label: "Log out of POS and lock till drawer",   done: false },
  ],
  manager: [
    { id: "verify_cash",    label: "Verify cashier's cash count matches system total", done: false },
    { id: "check_stock",    label: "Review low stock alerts and plan restocks",        done: false },
    { id: "record_expenses",label: "Ensure all expenses are recorded",                done: false },
    { id: "credits_review", label: "Review outstanding customer credits",             done: false },
    { id: "safe_deposit",   label: "Deposit cash into safe",                          done: false },
    { id: "lock_inventory", label: "Lock storage room and fridge",                   done: false },
    { id: "handover_report",label: "Complete handover report to owner or next shift", done: false },
  ],
  owner: [
    { id: "review_reports",  label: "Review today's sales and profit in Reports",    done: false },
    { id: "review_expenses", label: "Approve or query any unusual expenses",         done: false },
    { id: "staff_feedback",  label: "Give feedback to staff on performance",         done: false },
    { id: "restock_orders",  label: "Place orders for any critical low-stock items", done: false },
    { id: "safe_count",      label: "Count safe and verify cash deposit",            done: false },
    { id: "credits_action",  label: "Follow up on overdue customer credits",         done: false },
    { id: "plan_tomorrow",   label: "Plan opening needs for tomorrow",               done: false },
    { id: "system_backup",   label: "Confirm system data is up to date",             done: false },
  ],
};

export default function EndOfDay({ user }: Props) {
  const storageKey = `eod_checklist_${user.id}_${todayStr()}`;
  const rawSaved = localStorage.getItem(storageKey);
  const savedDone: Record<string, boolean> = rawSaved ? JSON.parse(rawSaved) : {};

  const [items, setItems] = useState<CheckItem[]>(() =>
    (CHECKLISTS[user.role] || CHECKLISTS.cashier).map(item => ({
      ...item,
      done: savedDone[item.id] || false,
    }))
  );

  const [todayStats, setTodayStats] = useState<{ revenue: number; txns: number; expenses: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const done: Record<string, boolean> = {};
    items.forEach(i => { done[i.id] = i.done; });
    localStorage.setItem(storageKey, JSON.stringify(done));
  }, [items, storageKey]);

  useEffect(() => {
    const today = todayStr();
    Promise.all([
      supabase.from("sale_transactions").select("id, total_amount").eq("sale_date", today).eq("is_voided", false),
      supabase.from("expenses").select("amount").eq("expense_date", today),
    ]).then(([txnRes, expRes]) => {
      const txns = (txnRes.data as any[]) || [];
      const exps = (expRes.data as any[]) || [];
      setTodayStats({
        revenue: txns.reduce((s: number, t: any) => s + Number(t.total_amount), 0),
        txns: txns.length,
        expenses: exps.reduce((s: number, e: any) => s + Number(e.amount), 0),
      });
      setLoadingStats(false);
    });
  }, []);

  const toggle = (id: string) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, done: !item.done } : item));

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;
  const progress = Math.round((doneCount / items.length) * 100);

  const resetAll = () => {
    if (!confirm("Reset all checklist items for today?")) return;
    setItems(prev => prev.map(i => ({ ...i, done: false })));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="text-sm opacity-80 mb-1">🌙 End of Day Checklist</div>
        <div className="text-xl font-bold">{formatFullDate()}</div>
        <div className="text-sm opacity-80 mt-0.5 capitalize">{user.name} — {user.role}</div>

        {!loadingStats && todayStats && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/20">
            <div>
              <div className="text-xs opacity-70">Sales Today</div>
              <div className="text-lg font-bold">{todayStats.txns}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Revenue</div>
              <div className="text-lg font-bold">{formatNaira(todayStats.revenue)}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Expenses</div>
              <div className="text-lg font-bold text-red-300">{formatNaira(todayStats.expenses)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">
            {doneCount}/{items.length} tasks complete
          </h3>
          <button onClick={resetAll} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>
        </div>

        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden mb-5">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${allDone ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="space-y-2">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all ${
                item.done ? "bg-green-50 border border-green-200" : "bg-muted/30 border border-border hover:border-primary/30"
              }`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                item.done ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground/40"
              }`}>
                {item.done && <span className="text-xs font-bold">✓</span>}
              </div>
              <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {allDone && (
          <div className="mt-5 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
            <div className="text-2xl mb-2">🎉</div>
            <div className="font-semibold text-green-800 text-sm">All done! Great work today.</div>
            <div className="text-xs text-green-700 mt-1">
              Have a good rest and see you tomorrow!
            </div>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="font-semibold text-amber-800 text-sm mb-2">📋 Closing Notes</div>
        <div className="text-xs text-amber-700 space-y-1">
          <p>• Cash must be counted in the presence of 2 staff members</p>
          <p>• Any discrepancy of ₦500+ must be reported to the owner immediately</p>
          <p>• Fridge items must be locked before leaving</p>
          <p>• Do not leave the shop without getting sign-off from a manager or owner</p>
        </div>
      </div>
    </div>
  );
}
