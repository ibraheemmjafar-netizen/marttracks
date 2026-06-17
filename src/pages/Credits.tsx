import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser, Credit } from "../supabase";
import { formatNaira, todayStr } from "../utils";

interface Props { user: AppUser; }

export default function Credits({ user }: Props) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [modal, setModal] = useState<"add" | "pay" | null>(null);
  const [selected, setSelected] = useState<Credit | null>(null);
  const [form, setForm] = useState({ customer_name: "", phone: "", amount_owed: "", notes: "" });
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Load every customer who has ever had credit recorded, not just those
    // who currently owe something. A customer who fully pays off their
    // debt should stay visible (just shown as settled) — otherwise their
    // history disappears, the owner loses the ability to see who reliably
    // pays back, and re-adding credit for that same person later would
    // wrongly look like a brand-new customer.
    const { data } = await supabase
      .from("credits")
      .select("*")
      .order("amount_owed", { ascending: false })
      .order("customer_name");
    setCredits((data as Credit[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ customer_name: "", phone: "", amount_owed: "", notes: "" });
    setModal("add");
  };

  const openPay = (c: Credit) => {
    setSelected(c);
    setPayAmount("");
    setModal("pay");
  };

  const addCredit = async () => {
    if (!form.customer_name.trim()) { setMsg({ type: "err", text: "Customer name required." }); return; }
    const amount = Number(form.amount_owed);
    if (!amount || amount <= 0) { setMsg({ type: "err", text: "Amount must be > 0." }); return; }
    setSaving(true);
    const existing = credits.find(c => c.customer_name.toLowerCase() === form.customer_name.trim().toLowerCase());
    if (existing) {
      const { error } = await supabase.from("credits").update({ amount_owed: existing.amount_owed + amount }).eq("id", existing.id);
      if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("credits").insert({
        customer_name: form.customer_name.trim(), phone: form.phone || null, amount_owed: amount,
        recorded_by: user.id, notes: form.notes || null,
      });
      if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
    }
    setMsg({ type: "ok", text: "Credit recorded!" });
    setModal(null);
    await load();
    setSaving(false);
  };

  const recordPayment = async () => {
    if (!selected) return;
    const pay = Number(payAmount);
    if (!pay || pay <= 0) { setMsg({ type: "err", text: "Enter a valid payment amount." }); return; }
    if (pay > selected.amount_owed) { setMsg({ type: "err", text: `Max is ${formatNaira(selected.amount_owed)}.` }); return; }
    setSaving(true);
    const remaining = selected.amount_owed - pay;
    const { error } = await supabase.from("credits").update({ amount_owed: remaining }).eq("id", selected.id);
    if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
    setMsg({ type: "ok", text: `Payment of ${formatNaira(pay)} recorded for ${selected.customer_name}!` });
    setModal(null);
    await load();
    setSaving(false);
  };

  const totalOwed = credits.reduce((s, c) => s + Number(c.amount_owed), 0);
  const owingCount = credits.filter(c => Number(c.amount_owed) > 0).length;
  const filtered = credits
    .filter(c => showSettled || Number(c.amount_owed) > 0)
    .filter(c =>
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search)
    );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text} <button className="ml-3 opacity-60" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <input type="search" placeholder="Search customer…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 flex-shrink-0">
          + Add Credit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Outstanding</div>
          <div className="text-xl font-bold text-red-600">{formatNaira(totalOwed)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Customers Currently Owing</div>
          <div className="text-xl font-bold">{owingCount}</div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} className="rounded" />
        Also show customers who have fully paid off (settled)
      </label>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? "No customers match your search." : "✅ No outstanding credits!"}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
          {filtered.map(c => {
            const settled = Number(c.amount_owed) === 0;
            return (
              <div key={c.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 ${settled ? "opacity-60" : ""}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${settled ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                  {c.customer_name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">{c.customer_name}</div>
                    {settled && <span className="badge-green text-xs">Settled</span>}
                  </div>
                  {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                  {c.notes && <div className="text-xs text-muted-foreground italic truncate">{c.notes}</div>}
                </div>
                <div className={`text-sm font-bold flex-shrink-0 ${settled ? "text-green-600" : "text-red-600"}`}>{formatNaira(c.amount_owed)}</div>
                {!settled && (
                  <button onClick={() => openPay(c)}
                    className="text-xs px-2 py-1.5 rounded border border-green-200 text-green-700 hover:bg-green-50 transition-colors flex-shrink-0 font-medium">
                    Record Payment
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal === "add" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold mb-4">Record Credit / Debt</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Customer Name</label>
                <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Musa Adamu" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone (optional)</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0801..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Amount Owed (₦)</label>
                <input type="number" value={form.amount_owed} onChange={e => setForm(f => ({ ...f, amount_owed: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0.00" min="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="What was bought on credit?" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={addCredit} disabled={saving} className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : "Record Credit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "pay" && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold mb-1">Record Payment</h3>
            <p className="text-sm text-muted-foreground mb-4">{selected.customer_name} owes {formatNaira(selected.amount_owed)}</p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Amount Paid (₦)</label>
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="0.00" max={selected.amount_owed} min="0" />
              <button className="mt-1 text-xs text-primary underline" onClick={() => setPayAmount(String(selected.amount_owed))}>
                Pay full amount ({formatNaira(selected.amount_owed)})
              </button>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={recordPayment} disabled={saving} className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
