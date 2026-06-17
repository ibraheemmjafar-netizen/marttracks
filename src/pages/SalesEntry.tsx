import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser, Product } from "../supabase";
import { formatNaira, todayStr } from "../utils";

interface BasketItem {
  product: Product;
  quantity: number;
}

interface TxnRow {
  id: string;
  sale_date: string;
  total_amount: number;
  is_voided: boolean;
  cashier_name: string;
  items: { product_name: string; quantity_units: number; total_price: number }[];
}

interface Props { user: AppUser; }

export default function SalesEntry({ user }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [search, setSearch] = useState("");
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [tab, setTab] = useState<"pos" | "history">("pos");

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayStr();

    const [prodRes, txnRes] = await Promise.all([
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase
        .from("sale_transactions")
        .select(`id, sale_date, total_amount, is_voided, users!cashier_id(name), sales(product_id, quantity_units, total_price, products(name))`)
        .eq("sale_date", today)
        .order("created_at", { ascending: false }),
    ]);

    setProducts((prodRes.data as Product[]) || []);

    const rawTxns = (txnRes.data as any[]) || [];
    setTxns(rawTxns.map(t => ({
      id: t.id,
      sale_date: t.sale_date,
      total_amount: t.total_amount,
      is_voided: t.is_voided,
      cashier_name: t.users?.name || "?",
      items: (t.sales || []).map((s: any) => ({
        product_name: s.products?.name || "?",
        quantity_units: s.quantity_units,
        total_price: s.total_price,
      })),
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addToBasket = (p: Product) => {
    setBasket(prev => {
      const existing = prev.find(b => b.product.id === p.id);
      if (existing) {
        if (existing.quantity >= p.current_stock) {
          setMsg({ type: "err", text: `Not enough stock for ${p.name}` });
          return prev;
        }
        return prev.map(b => b.product.id === p.id ? { ...b, quantity: b.quantity + 1 } : b);
      }
      if (p.current_stock < 1) {
        setMsg({ type: "err", text: `${p.name} is out of stock!` });
        return prev;
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  };

  const removeFromBasket = (pid: string) => setBasket(prev => prev.filter(b => b.product.id !== pid));

  const updateQty = (pid: string, qty: number) => {
    const p = basket.find(b => b.product.id === pid)?.product;
    if (!p) return;
    if (qty < 1) { removeFromBasket(pid); return; }
    if (qty > p.current_stock) {
      setMsg({ type: "err", text: `Only ${p.current_stock} units of ${p.name} in stock` });
      return;
    }
    setBasket(prev => prev.map(b => b.product.id === pid ? { ...b, quantity: qty } : b));
  };

  const basketTotal = basket.reduce((s, b) => s + b.product.sell_price * b.quantity, 0);

  const completeSale = async () => {
    if (basket.length === 0) return;
    setProcessing(true);
    setMsg(null);

    const today = todayStr();

    const { data: txn, error: txnErr } = await supabase
      .from("sale_transactions")
      .insert({
        cashier_id: user.id,
        sale_date: today,
        total_amount: basketTotal,
        is_voided: false,
      })
      .select("id")
      .single();

    if (txnErr || !txn) {
      setMsg({ type: "err", text: "Failed to record transaction. Try again." });
      setProcessing(false);
      return;
    }

    const saleRows = basket.map(b => ({
      transaction_id: txn.id,
      product_id: b.product.id,
      quantity_units: b.quantity,
      unit_price: b.product.sell_price,
      cost_price: b.product.buy_price, // lock in today's buy price so a
                                        // future price change can never
                                        // silently rewrite this sale's profit
      total_price: b.product.sell_price * b.quantity,
      sale_date: today,
      user_id: user.id,
    }));

    const { error: salesErr } = await supabase.from("sales").insert(saleRows);
    if (salesErr) {
      await supabase.from("sale_transactions").delete().eq("id", txn.id);
      setMsg({ type: "err", text: "Failed to record sale items. Try again." });
      setProcessing(false);
      return;
    }

    // Deduct stock atomically — a single database operation per product,
    // so two simultaneous sales of the same item can never both read the
    // same starting stock number and silently lose one deduction.
    for (const b of basket) {
      await supabase.rpc("adjust_stock", { p_product_id: b.product.id, p_delta: -b.quantity });
    }

    setBasket([]);
    setMsg({ type: "ok", text: `Sale of ${formatNaira(basketTotal)} recorded!` });
    await load();
    setProcessing(false);
  };

  const voidTxn = async (txnId: string) => {
    if (!confirm("Void this transaction? Stock will be restored.")) return;
    setProcessing(true);

    const { data: saleItems } = await supabase
      .from("sales")
      .select("product_id, quantity_units")
      .eq("transaction_id", txnId);

    const { error } = await supabase
      .from("sale_transactions")
      .update({ is_voided: true, voided_at: new Date().toISOString(), voided_by: user.id })
      .eq("id", txnId);

    if (error) {
      setMsg({ type: "err", text: "Failed to void transaction." });
      setProcessing(false);
      return;
    }

    // Also flag the underlying sale rows themselves. The transaction-level
    // flag alone is enough for Dashboard/Reports (which always join through
    // sale_transactions), but flagging here too means any future feature
    // that queries the "sales" table directly can't accidentally count a
    // voided sale as real — it's safe by default, not just by convention.
    await supabase.from("sales").update({ is_voided: true } as any).eq("transaction_id", txnId);

    if (saleItems) {
      for (const item of saleItems) {
        await supabase.rpc("adjust_stock", { p_product_id: item.product_id, p_delta: item.quantity_units });
      }
    }

    setMsg({ type: "ok", text: "Transaction voided and stock restored." });
    await load();
    setProcessing(false);
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const canVoid = user.role === "owner" || user.role === "manager";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {msg.text}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setTab("pos")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "pos" ? "bg-primary text-white" : "bg-card border border-border hover:bg-muted"}`}
        >
          💳 Point of Sale
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "history" ? "bg-primary text-white" : "bg-card border border-border hover:bg-muted"}`}
        >
          📋 Today&apos;s Transactions
        </button>
      </div>

      {tab === "pos" ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-3">
            <input
              type="search"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToBasket(p)}
                    disabled={p.current_stock < 1}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      p.current_stock < 1
                        ? "opacity-40 cursor-not-allowed bg-muted border-border"
                        : "bg-card border-border hover:border-primary hover:shadow-sm active:scale-95"
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.category}</div>
                    <div className="text-sm font-bold text-primary mt-1">{formatNaira(p.sell_price)}</div>
                    <div className={`text-xs mt-0.5 ${p.current_stock <= (p.low_stock_threshold || 5) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                      {p.current_stock} in stock
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground text-sm py-8">No products found.</p>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-xl p-4 sticky top-0">
              <h3 className="font-semibold text-sm mb-3">🛒 Basket</h3>

              {basket.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">Tap a product to add it.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin mb-3">
                  {basket.map(b => (
                    <div key={b.product.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{b.product.name}</div>
                        <div className="text-xs text-muted-foreground">{formatNaira(b.product.sell_price)} each</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(b.product.id, b.quantity - 1)}
                          className="w-6 h-6 rounded bg-muted text-foreground text-sm flex items-center justify-center hover:bg-muted/80"
                        >−</button>
                        <span className="w-6 text-center text-sm font-medium">{b.quantity}</span>
                        <button
                          onClick={() => updateQty(b.product.id, b.quantity + 1)}
                          className="w-6 h-6 rounded bg-muted text-foreground text-sm flex items-center justify-center hover:bg-muted/80"
                        >+</button>
                      </div>
                      <div className="text-sm font-semibold w-20 text-right">{formatNaira(b.product.sell_price * b.quantity)}</div>
                      <button onClick={() => removeFromBasket(b.product.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatNaira(basketTotal)}</span>
                </div>
                <button
                  onClick={completeSale}
                  disabled={basket.length === 0 || processing}
                  className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? "Processing…" : "✅ Complete Sale"}
                </button>
                {basket.length > 0 && (
                  <button
                    onClick={() => setBasket([])}
                    className="w-full py-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear Basket
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Today&apos;s Transactions — {txns.length} total</h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : txns.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No transactions today yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {txns.map(t => (
                <div key={t.id} className={`px-4 py-3 ${t.is_voided ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{formatNaira(t.total_amount)}</span>
                        {t.is_voided && <span className="badge-red">VOIDED</span>}
                        <span className="text-xs text-muted-foreground">by {t.cashier_name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t.items.map(i => `${i.product_name} ×${i.quantity_units}`).join(", ")}
                      </div>
                    </div>
                    {canVoid && !t.is_voided && (
                      <button
                        onClick={() => voidTxn(t.id)}
                        disabled={processing}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        Void
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
