import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser, Supplier } from "../supabase";

interface Props { user: AppUser; }

export default function Suppliers({ user }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ name: "", phone: "", email: "", address: "", notes: "" });
    setSelected(null);
    setModal("add");
  };

  const openEdit = (s: Supplier) => {
    setSelected(s);
    setForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" });
    setModal("edit");
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg({ type: "err", text: "Supplier name required." }); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(), phone: form.phone || null, email: form.email || null,
      address: form.address || null, notes: form.notes || null,
    };
    if (modal === "add") {
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
      setMsg({ type: "ok", text: "Supplier added!" });
    } else if (selected) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", selected.id);
      if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
      setMsg({ type: "ok", text: "Supplier updated!" });
    }
    setModal(null);
    await load();
    setSaving(false);
  };

  const deleteSupplier = async (s: Supplier) => {
    if (!confirm(`Delete ${s.name}?`)) return;
    await supabase.from("suppliers").delete().eq("id", s.id);
    await load();
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || "").includes(search)
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text} <button className="ml-3 opacity-60" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <input type="search" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 flex-shrink-0">
          + Add Supplier
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? "No suppliers match your search." : "No suppliers added yet."}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
          {filtered.map(s => (
            <div key={s.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0 mt-0.5">
                {s.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{s.name}</div>
                <div className="flex flex-wrap gap-2 mt-0.5">
                  {s.phone && <span className="text-xs text-muted-foreground">📞 {s.phone}</span>}
                  {s.email && <span className="text-xs text-muted-foreground">✉️ {s.email}</span>}
                  {s.address && <span className="text-xs text-muted-foreground">📍 {s.address}</span>}
                </div>
                {s.notes && <div className="text-xs text-muted-foreground italic mt-0.5 truncate">{s.notes}</div>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => openEdit(s)} className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors">Edit</button>
                {user.role === "owner" && (
                  <button onClick={() => deleteSupplier(s)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold mb-4">{modal === "add" ? "Add Supplier" : "Edit Supplier"}</h3>
            <div className="space-y-3">
              {[
                { key: "name", label: "Name *", placeholder: "e.g. Alhaji Store" },
                { key: "phone", label: "Phone", placeholder: "0801..." },
                { key: "email", label: "Email", placeholder: "supplier@email.com" },
                { key: "address", label: "Address", placeholder: "Keffi market, block 3" },
                { key: "notes", label: "Notes", placeholder: "Best for drinks, open Mon-Sat" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={f.placeholder} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
