import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { AppUser, Product } from "../supabase";
import { formatNaira, todayStr, formatMonthYear } from "../utils";

interface Props { user: AppUser; }

interface Stats {
  todaySales: number;
  todayRevenue: number;
  monthRevenue: number;
  monthProfit: number;
  monthExpenses: number;
  lowStock: Product[];
  topProducts: { name: string; qty: number; revenue: number }[];
}

export default function Dashboard({ user }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today = todayStr();
    const monthStart = today.slice(0, 7) + "-01";

    const [salesRes, expensesRes, productsRes] = await Promise.all([
      supabase
        .from("sale_transactions")
        .select("id, sale_date, total_amount, is_voided, sales(*)")
        .eq("is_voided", false)
        .gte("sale_date", monthStart),
      supabase
        .from("expenses")
        .select("amount, expense_date")
        .gte("expense_date", monthStart),
      supabase
        .from("products")
        .select("*"),
    ]);

    const txns = (salesRes.data as any[]) || [];
    const expenses = (expensesRes.data as any[]) || [];
    const products = (productsRes.data as Product[]) || [];

    const todayTxns = txns.filter(t => t.sale_date === today);
    const todaySales = todayTxns.length;
    const todayRevenue = todayTxns.reduce((s: number, t: any) => s + Number(t.total_amount), 0);
    const monthRevenue = txns.reduce((s: number, t: any) => s + Number(t.total_amount), 0);
    const monthExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

    const productMap = new Map(products.map(p => [p.id, p]));
    let monthCost = 0;
    const soldMap = new Map<string, { qty: number; revenue: number; name: string }>();

    for (const txn of txns) {
      const items: any[] = txn.sales || [];
      for (const item of items) {
        const p = productMap.get(item.product_id);
        if (p) monthCost += Number(item.quantity_units) * p.buy_price;
        const cur = soldMap.get(item.product_id) || { qty: 0, revenue: 0, name: p?.name || "?" };
        soldMap.set(item.product_id, {
          qty: cur.qty + Number(item.quantity_units),
          revenue: cur.revenue + Number(item.total_price),
          name: cur.name,
        });
      }
    }

    const monthProfit = monthRevenue - monthCost - monthExpenses;
    const lowStock = products
      .filter(p => p.current_stock <= (p.low_stock_threshold ?? 5))
      .sort((a, b) => a.current_stock - b.current_stock)
      .slice(0, 8);

    const topProducts = [...soldMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    setStats({ todaySales, todayRevenue, monthRevenue, monthProfit, monthExpenses, lowStock, topProducts });
    setLoading(false);
  }

  if (loading) return <Spinner />;

  const s = stats!;
  const month = formatMonthYear();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h2 className="text-xl font-bold text-foreground">Overview — {month}</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Sales" value={s.todaySales.toString()} sub="transactions" color="bg-blue-50 border-blue-100" />
        <StatCard label="Today Revenue" value={formatNaira(s.todayRevenue)} sub="cash in" color="bg-green-50 border-green-100" />
        <StatCard label="Month Revenue" value={formatNaira(s.monthRevenue)} sub="total sales" color="bg-purple-50 border-purple-100" />
        <StatCard
          label="Month Profit"
          value={formatNaira(s.monthProfit)}
          sub="after cost & expenses"
          color={s.monthProfit >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">🏆 Top Products This Month</h3>
          {s.topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No sales yet this month.</p>
          ) : (
            <div className="space-y-3">
              {s.topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.qty} units sold</div>
                  </div>
                  <div className="text-sm font-semibold text-green-700">{formatNaira(p.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">⚠️ Low Stock Alert</h3>
          {s.lowStock.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">✅ All products well stocked!</p>
          ) : (
            <div className="space-y-2">
              {s.lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    p.current_stock === 0
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {p.current_stock} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(user.role === "owner" || user.role === "manager") && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Month Expenses</div>
            <div className="text-xl font-bold text-red-600">{formatNaira(s.monthExpenses)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Cost of Goods</div>
            <div className="text-xl font-bold text-orange-600">
              {formatNaira(s.monthRevenue - s.monthProfit - s.monthExpenses)}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Profit Margin</div>
            <div className={`text-xl font-bold ${s.monthRevenue > 0 && s.monthProfit / s.monthRevenue > 0.1 ? "text-green-600" : "text-red-600"}`}>
              {s.monthRevenue > 0 ? ((s.monthProfit / s.monthRevenue) * 100).toFixed(1) + "%" : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-bold text-foreground leading-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
