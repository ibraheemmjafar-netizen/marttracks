import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser, Product } from "../supabase";
import { formatNaira, todayStr } from "../utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Props { user: AppUser; }

interface DaySummary {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  txnCount: number;
}

export default function Reports({ user }: Props) {
  const [range, setRange] = useState<"week" | "month" | "custom">("month");
  const [from, setFrom] = useState(todayStr().slice(0, 7) + "-01");
  const [to, setTo] = useState(todayStr());
  const [days, setDays] = useState<DaySummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<{ amount: number; category: string; expense_date: string }[]>([]);
  const [restocks, setRestocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "restocks" | "prices">("summary");
  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  const computeRange = useCallback(() => {
    const today = todayStr();
    if (range === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { f: d.toISOString().split("T")[0], t: today };
    }
    if (range === "month") {
      return { f: today.slice(0, 7) + "-01", t: today };
    }
    return { f: from, t: to };
  }, [range, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const { f, t } = computeRange();

    const [txnRes, expRes, prodRes, restockRes, priceRes] = await Promise.all([
      supabase
        .from("sale_transactions")
        .select("id, sale_date, total_amount, is_voided, sales(product_id, quantity_units, total_price)")
        .eq("is_voided", false)
        .gte("sale_date", f)
        .lte("sale_date", t)
        .order("sale_date"),
      supabase
        .from("expenses")
        .select("amount, category, expense_date")
        .gte("expense_date", f)
        .lte("expense_date", t),
      supabase.from("products").select("*"),
      supabase
        .from("restocks")
        .select("*, products(name), users!recorded_by(name)")
        .gte("restock_date", f)
        .lte("restock_date", t)
        .order("restock_date", { ascending: false }),
      supabase
        .from("price_history")
        .select("*, products(name), users!changed_by(name)")
        .gte("change_date", f)
        .lte("change_date", t)
        .order("change_date", { ascending: false }),
    ]);

    const txns = (txnRes.data as any[]) || [];
    const expData = (expRes.data as any[]) || [];
    const prodData = (prodRes.data as Product[]) || [];
    const restockData = (restockRes.data as any[]) || [];
    const priceData = (priceRes.data as any[]) || [];

    const productMap = new Map(prodData.map(p => [p.id, p]));
    const dayMap = new Map<string, DaySummary>();

    for (const txn of txns) {
      const d = txn.sale_date;
      if (!dayMap.has(d)) dayMap.set(d, { date: d, revenue: 0, cost: 0, profit: 0, txnCount: 0 });
      const ds = dayMap.get(d)!;
      ds.revenue += Number(txn.total_amount);
      ds.txnCount += 1;
      for (const item of txn.sales || []) {
        const p = productMap.get(item.product_id);
        if (p) ds.cost += Number(item.quantity_units) * p.buy_price;
      }
    }

    for (const [d, ds] of dayMap.entries()) {
      const expOnDay = expData.filter(e => e.expense_date === d).reduce((s: number, e: any) => s + Number(e.amount), 0);
      ds.profit = ds.revenue - ds.cost - expOnDay;
    }

    setDays([...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)));
    setExpenses(expData);
    setProducts(prodData);
    setRestocks(restockData);
    setPriceHistory(priceData);
    setLoading(false);
  }, [computeRange]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = days.reduce((s, d) => s + d.revenue, 0);
  const totalCost = days.reduce((s, d) => s + d.cost, 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalRevenue - totalCost - totalExpenses;

  const chartData = days.map(d => ({
    date: d.date.slice(5),
    Revenue: d.revenue,
    Profit: d.profit,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["week","month","custom"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-2 capitalize transition-colors ${range === r ? "bg-primary text-white" : "hover:bg-muted"}`}>
              {r === "week" ? "7 Days" : r === "month" ? "This Month" : "Custom"}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg" />
          </>
        )}
        <button onClick={load} className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90">Load</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Revenue", value: formatNaira(totalRevenue), color: "text-blue-600" },
          { label: "Cost of Goods", value: formatNaira(totalCost), color: "text-orange-600" },
          { label: "Expenses", value: formatNaira(totalExpenses), color: "text-red-600" },
          { label: "Profit", value: formatNaira(totalProfit), color: totalProfit >= 0 ? "text-green-600" : "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">Daily Revenue vs Profit</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => "₦" + (v / 1000).toFixed(0) + "k"} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Bar dataKey="Revenue" fill="#16a34a" radius={[3,3,0,0]} />
              <Bar dataKey="Profit" fill="#22d3ee" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-2">
        {(["summary","restocks","prices"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-sm rounded-lg capitalize transition-colors ${activeTab === t ? "bg-primary text-white" : "bg-card border border-border hover:bg-muted"}`}>
            {t === "summary" ? "Day Summary" : t === "restocks" ? "Restocks" : "Price Changes"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === "summary" ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-right px-4 py-3">Transactions</th>
                  <th className="text-right px-4 py-3">Revenue</th>
                  <th className="text-right px-4 py-3">COGS</th>
                  <th className="text-right px-4 py-3">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No sales in this period.</td></tr>
                ) : days.map(d => (
                  <tr key={d.date} className="hover:bg-muted/20">
                    <td className="px-4 py-3">{d.date}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{d.txnCount}</td>
                    <td className="px-4 py-3 text-right">{formatNaira(d.revenue)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{formatNaira(d.cost)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${d.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatNaira(d.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "restocks" ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-right px-4 py-3">Qty</th>
                  <th className="text-right px-4 py-3">Buy Price</th>
                  <th className="text-left px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {restocks.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No restocks in this period.</td></tr>
                ) : restocks.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">{r.restock_date}</td>
                    <td className="px-4 py-3 font-medium">{r.products?.name}</td>
                    <td className="px-4 py-3 text-right">{r.quantity}</td>
                    <td className="px-4 py-3 text-right">{r.new_buy_price ? formatNaira(r.new_buy_price) : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.users?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-right px-4 py-3">Old Buy/Sell</th>
                  <th className="text-right px-4 py-3">New Buy/Sell</th>
                  <th className="text-left px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {priceHistory.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No price changes in this period.</td></tr>
                ) : priceHistory.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">{p.change_date}</td>
                    <td className="px-4 py-3 font-medium">{p.products?.name}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {formatNaira(p.old_buy_price)} / {formatNaira(p.old_sell_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold">
                      {formatNaira(p.new_buy_price)} / {formatNaira(p.new_sell_price)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.users?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
