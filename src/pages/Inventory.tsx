import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser, Product } from "../supabase";
import { formatNaira, todayStr } from "../utils";

interface Props { user: AppUser; }

const CATEGORIES = ["Drinks", "Snacks", "Bread", "Household", "Tobacco", "Other"];

export default function Inventory({ user }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [modal, setModal] = useState<"add" | "restock" | "edit" | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);

  const [form, setForm] = useState({
    name: "", category: "Drinks",
    buy_price: "", sell_price: "", open_stock: "",
    stock_type: "units", units_per_carton: "1",
    low_stock_threshold: "5", is_fridge_item: false,
  });
  const [restockForm, setRestockForm] = useState({
    qty: "", new_buy_price: "", new_sell_price: "", note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("category,name");
    setProducts((data as Product[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ name: "", category: "Drinks", buy_price: "", sell_price: "", open_stock: "", stock_type: "units", units_per_carton: "1", low_stock_threshold: "5", is_fridge_item: false });
    setModal("add");
  };

  const openEdit = (p: Product) => {
    setSelected(p);
    setForm({
      name: p.name, category: p.category,
      buy_price: String(p.buy_price), sell_price: String(p.sell_price),
      open_stock: String(p.current_stock),
      stock_type: p.stock_type || "units",
      units_per_carton: String(p.units_per_carton || 1),
      low_stock_threshold: String(p.low_stock_threshold ?? 5),
      is_fridge_item: p.is_fridge_item || false,
    });
    setModal("edit");
  };

  const openRestock = (p: Product) => {
    setSelected(p);
    setRestockForm({ qty: "", new_buy_price: "", new_sell_price: "", note: "" });
    setModal("restock");
  };

  const saveProduct = async () => {
    const bp = Number(form.buy_price);
    const sp = Number(form.sell_price);
    const os = Number(form.open_stock);
    if (!form.name.trim()) { setMsg({ type: "err", text: "Product name required." }); return; }
    if (bp <= 0 || sp <= 0) { setMsg({ type: "err", text: "Prices must be > 0." }); return; }
    if (sp <= bp) { setMsg({ type: "err", text: "Sell price must be higher than buy price." }); return; }
    const upc = form.stock_type === "carton" ? (Number(form.units_per_carton) || 1) : 1;
    const payload = {
      name: form.name.trim(), category: form.category,
      buy_price: bp, sell_price: sp, open_stock: os, current_stock: os,
      stock_type: form.stock_type, units_per_carton: upc,
      low_stock_threshold: Number(form.low_stock_threshold) || 5,
      is_fridge_item: form.is_fridge_item, active: true,
    };
    const { error } = await supabase.from("products").insert(payload);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setMsg({ type: "ok", text: "Product added!" });
    setModal(null);
    await load();
  };

  const updateProduct = async () => {
    if (!selected) return;
    const bp = Number(form.buy_price);
    const sp = Number(form.sell_price);
    if (sp <= bp) { setMsg({ type: "err", text: "Sell price must be higher than buy price." }); return; }
    const upc = form.stock_type === "carton" ? (Number(form.units_per_carton) || 1) : 1;
    const priceChanged = bp !== selected.buy_price || sp !== selected.sell_price;
    const { error } = await supabase.from("products").update({
      name: form.name.trim(), category: form.category,
      buy_price: bp, sell_price: sp,
      stock_type: form.stock_type, units_per_carton: upc,
      low_stock_threshold: Number(form.low_stock_threshold) || 5,
      is_fridge_item: form.is_fridge_item,
    }).eq("id", selected.id);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    // Price changes are tracked in Reports → Price History regardless of
    // which screen they came from. Without this, editing a product directly
    // would let a price change happen with zero audit trail, even though
    // the exact same change made through Restock is always logged.
    if (priceChanged) {
      await supabase.from("price_history").insert({
        product_id: selected.id, old_buy_price: selected.buy_price, old_sell_price: selected.sell_price,
        new_buy_price: bp, new_sell_price: sp,
        changed_by: user.id, change_date: todayStr(), reason: "Edited via Inventory",
      });
    }
    setMsg({ type: "ok", text: "Product updated!" });
    setModal(null);
    await load();
  };

  const doRestock = async () => {
    if (!selected) return;
    const qty = Number(restockForm.qty);
    if (!qty || qty <= 0) { setMsg({ type: "err", text: "Enter a valid quantity." }); return; }
    const newBP = restockForm.new_buy_price ? Number(restockForm.new_buy_price) : null;
    const newSP = restockForm.new_sell_price ? Number(restockForm.new_sell_price) : null;
    if (newSP && newBP && newSP <= newBP) { setMsg({ type: "err", text: "New sell price must be above new buy price." }); return; }

    // Stock increment is atomic (database-level), separate from any price
    // change, so a restock can never silently lose units the same way a
    // race between two simultaneous sales could.
    await supabase.rpc("adjust_stock", { p_product_id: selected.id, p_delta: qty });

    if (newBP || newSP) {
      const priceUpdates: Record<string, unknown> = {};
      if (newBP) priceUpdates.buy_price = newBP;
      if (newSP) priceUpdates.sell_price = newSP;
      const { error } = await supabase.from("products").update(priceUpdates).eq("id", selected.id);
      if (error) { setMsg({ type: "err", text: error.message }); return; }
    }

    await supabase.from("restocks").insert({
      product_id: selected.id, quantity: qty, recorded_by: user.id,
      new_buy_price: newBP, new_sell_price: newSP,
      restock_date: todayStr(), note: restockForm.note || null,
    });

    if (newBP || newSP) {
      await supabase.from("price_history").insert({
        product_id: selected.id, old_buy_price: selected.buy_price, old_sell_price: selected.sell_price,
        new_buy_price: newBP || selected.buy_price, new_sell_price: newSP || selected.sell_price,
        changed_by: user.id, change_date: todayStr(), reason: "Restock",
      });
    }

    setMsg({ type: "ok", text: `Restocked ${qty} units of ${selected.name}!` });
    setModal(null);
    await load();
  };

  const deactivate = async (p: Product) => {
    if (!confirm(`Remove ${p.name} from active products? It will move to the "Removed products" list and stop appearing in Sales — you can bring it back anytime.`)) return;
    await supabase.from("products").update({ active: false }).eq("id", p.id);
    setMsg({ type: "ok", text: `${p.name} removed. View it under "Removed products" to bring it back.` });
    await load();
  };

  const reactivate = async (p: Product) => {
    await supabase.from("products").update({ active: true }).eq("id", p.id);
    setMsg({ type: "ok", text: `${p.name} restored to active products.` });
    await load();
  };

  const categories = ["All", ...CATEGORIES];
  const filtered = products.filter(p =>
    (catFilter === "All" || p.category === catFilter) &&
    (statusFilter === "all" || (statusFilter === "active" ? p.active !== false : p.active === false)) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-card"
        >
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value as "active" | "inactive" | "all")}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-card"
        >
          <option value="active">Active products</option>
          <option value="inactive">Removed products</option>
          <option value="all">All products</option>
        </select>
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0">
          + Add Product
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Product</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-right px-4 py-3 font-semibold">Buy <span className="text-muted-foreground font-normal">(per unit)</span></th>
                  <th className="text-right px-4 py-3 font-semibold">Sell <span className="text-muted-foreground font-normal">(per unit)</span></th>
                  <th className="text-right px-4 py-3 font-semibold">Stock</th>
                  <th className="text-center px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {p.is_fridge_item && <span className="badge-blue">❄️ Fridge item</span>}
                        {p.stock_type === "carton" && (
                          <span className="badge-gray">📦 Carton of {p.units_per_carton}</span>
                        )}
                        {p.active === false && <span className="badge-red">Removed</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatNaira(p.buy_price)}
                      {p.stock_type === "carton" && (
                        <div className="text-xs text-muted-foreground/70">
                          {formatNaira(p.buy_price * p.units_per_carton)}/carton
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatNaira(p.sell_price)}
                      {p.stock_type === "carton" && (
                        <div className="text-xs text-muted-foreground/70 font-normal">
                          {formatNaira(p.sell_price * p.units_per_carton)}/carton
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${p.current_stock <= (p.low_stock_threshold ?? 5) ? "text-red-600" : "text-green-700"}`}>
                        {p.current_stock}
                      </span>
                      {p.current_stock <= (p.low_stock_threshold ?? 5) && (
                        <div className="text-xs text-red-500">Low!</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1.5">
                        {p.active !== false && (
                          <button onClick={() => openRestock(p)} className="text-xs px-2 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50 transition-colors">Restock</button>
                        )}
                        {user.role !== "cashier" && p.active !== false && (
                          <button onClick={() => openEdit(p)} className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors">Edit</button>
                        )}
                        {user.role === "owner" && p.active !== false && (
                          <button onClick={() => deactivate(p)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Remove</button>
                        )}
                        {user.role === "owner" && p.active === false && (
                          <button onClick={() => reactivate(p)} className="text-xs px-2 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50 transition-colors">Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(modal === "add" || modal === "edit") && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 className="text-base font-semibold mb-4">{modal === "add" ? "Add Product" : "Edit Product"}</h3>
          <div className="space-y-3">
            <Field label="Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="e.g. Coca-Cola 60cl" />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={INPUT}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buy Price (₦) — per unit/bottle">
                <input type="number" value={form.buy_price} onChange={e => setForm(f => ({ ...f, buy_price: e.target.value }))} className={INPUT} placeholder="0.00" min="0" />
              </Field>
              <Field label="Sell Price (₦) — per unit/bottle">
                <input type="number" value={form.sell_price} onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))} className={INPUT} placeholder="0.00" min="0" />
              </Field>
            </div>
            {modal === "add" && (
              <Field label={`Opening Stock — in ${form.stock_type === "carton" ? "individual units/bottles, not cartons" : "units"}`}>
                <input type="number" value={form.open_stock} onChange={e => setForm(f => ({ ...f, open_stock: e.target.value }))} className={INPUT} placeholder="0" min="0" />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock Type">
                <select value={form.stock_type} onChange={e => setForm(f => ({ ...f, stock_type: e.target.value }))} className={INPUT}>
                  <option value="units">Units (sold individually)</option>
                  <option value="carton">Carton (bulk packs, e.g. 24 bottles)</option>
                </select>
              </Field>
              {form.stock_type === "carton" && (
                <Field label="Units per Carton">
                  <input type="number" value={form.units_per_carton} onChange={e => setForm(f => ({ ...f, units_per_carton: e.target.value }))} className={INPUT} min="1" placeholder="e.g. 24" />
                </Field>
              )}
              <Field label="Low Stock Threshold">
                <input type="number" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))} className={INPUT} min="0" />
              </Field>
            </div>
            {form.stock_type === "carton" && Number(form.units_per_carton) > 1 && form.buy_price && form.sell_price && (
              <div className="text-xs bg-muted/50 border border-border rounded-lg px-3 py-2 text-muted-foreground">
                A full carton of {form.units_per_carton} = Buy {formatNaira(Number(form.buy_price) * Number(form.units_per_carton))} · Sell {formatNaira(Number(form.sell_price) * Number(form.units_per_carton))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_fridge_item} onChange={e => setForm(f => ({ ...f, is_fridge_item: e.target.checked }))} className="rounded" />
              ❄️ Fridge item
            </label>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
            <button onClick={modal === "add" ? saveProduct : updateProduct} className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
              {modal === "add" ? "Add Product" : "Save Changes"}
            </button>
          </div>
        </ModalOverlay>
      )}

      {modal === "restock" && selected && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 className="text-base font-semibold mb-1">Restock — {selected.name}</h3>
          <p className="text-xs text-muted-foreground mb-4">Current stock: {selected.current_stock} units</p>
          <div className="space-y-3">
            <Field label={selected.stock_type === "carton" ? `Quantity to Add — in individual units (1 carton = ${selected.units_per_carton} units)` : "Quantity to Add — in units"}>
              <input type="number" value={restockForm.qty} onChange={e => setRestockForm(f => ({ ...f, qty: e.target.value }))} className={INPUT} placeholder={selected.stock_type === "carton" ? `e.g. ${selected.units_per_carton} for 1 carton` : "e.g. 24"} min="1" />
              {selected.stock_type === "carton" && restockForm.qty && Number(restockForm.qty) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  = {(Number(restockForm.qty) / selected.units_per_carton).toFixed(2)} carton(s)
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New Buy Price (₦/unit, optional)">
                <input type="number" value={restockForm.new_buy_price} onChange={e => setRestockForm(f => ({ ...f, new_buy_price: e.target.value }))} className={INPUT} placeholder={String(selected.buy_price)} min="0" />
              </Field>
              <Field label="New Sell Price (₦/unit, optional)">
                <input type="number" value={restockForm.new_sell_price} onChange={e => setRestockForm(f => ({ ...f, new_sell_price: e.target.value }))} className={INPUT} placeholder={String(selected.sell_price)} min="0" />
              </Field>
            </div>
            <Field label="Note (optional)">
              <input value={restockForm.note} onChange={e => setRestockForm(f => ({ ...f, note: e.target.value }))} className={INPUT} placeholder="e.g. Bought from Alhaji's shop" />
            </Field>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
            <button onClick={doRestock} className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">Confirm Restock</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

const INPUT = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
