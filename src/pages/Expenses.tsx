import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser } from "../supabase";
import { formatNaira, todayStr, monthStartStr } from "../utils";

interface Props { user: AppUser; }

const CATS = ["Stock Purchase", "Utilities", "Maintenance", "Transport", "Salary", "Other"];

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  recorded_by: string;
  recorder_name?: string;
}

export default function Expenses({ user }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ description: "", amount: "", category: "Other", expense_date: todayStr() });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const monthStart = monthStartStr();
    const { data } = await supabase
      .from("expenses")
      .select("*, users!recorded_by(name)")
      .gte("expense_date", monthStart)
      .order("expense_date", { ascending: false });
    setExpenses(((data as any[]) || []).map(e => ({ ...e, recorder_name: e.users?.name || "?" })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addExpense = async () => {
    const amount = Number(form.amount);
    if (!form.description.trim()) { setMsg({ type: "err", text: "Description required." }); return; }
    if (!amount || amount <= 0) { setMsg({ type: "err", text: "Amount must be > 0." }); return; }
    setAdding(true);
    const { error } = await supabase.from("expenses").insert({
      description: form.description.trim(), amount, category: form.category,
      expense_date: form.expense_date, recorded_by: user.id,
    });
    if (error) { setMsg({ type: "err", text: error.message }); setAdding(false); return; }
    setMsg({ type: "ok", text: "Expense recorded!" });
    setForm({ description: "", amount: "", category: "Other", expense_date: todayStr() });
    await load();
    setAdding(false);
  };

  const deleteExpense = async (e: Expense) => {
    const reason = prompt(`Why are you deleting this expense?\n"${e.description}" — ${formatNaira(e.amount)}\n\nThis is logged for accountability.`);
    if (reason === null) return; // cancelled
    if (!reason.trim()) { setMsg({ type: "err", text: "A reason is required to delete an expense." }); return; }
    // Keep an audit trail of the deletion itself before removing the row,
    // so a deleted expense can never be used to quietly hide where cash
    // actually went — there's always a record of who removed what and why.
    await supabase.from("expenses").insert({
      description: `[DELETED] ${e.description} — reason: ${reason.trim()}`,
      amount: 0,
      category: "Other",
      expense_date: e.expense_date,
      recorded_by: user.id,
    });
    await supabase.from("expenses").delete().eq("id", e.id);
    await load();
  };

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = CATS.map(c => ({
    label: c,
    amount: expenses.filter(e => e.category === c).reduce((s, e) => s + Number(e.amount), 0),
  })).filter(c => c.amount > 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text} <button className="ml-3 opacity-60" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4">Record Expense</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="What was purchased?" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Amount (₦)</label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="0.00" min="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background">
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
            <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background" />
          </div>
        </div>
        <button onClick={addExpense} disabled={adding}
          className="mt-4 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {adding ? "Saving…" : "💰 Record Expense"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">This Month Total</div>
          <div className="text-xl font-bold text-red-600">{formatNaira(total)}</div>
        </div>
        {byCategory.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-bold">{formatNaira(c.amount)}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">This Month's Expenses</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No expenses recorded this month.</p>
        ) : (
          <div className="divide-y divide-border">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.description}</div>
                  <div className="text-xs text-muted-foreground">{e.category} • {e.expense_date} • {e.recorder_name}</div>
                </div>
                <div className="text-sm font-semibold text-red-600 flex-shrink-0">{formatNaira(e.amount)}</div>
                {user.role === "owner" && (
                  <button onClick={() => deleteExpense(e)} className="text-muted-foreground hover:text-destructive text-xs ml-1 flex-shrink-0">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
