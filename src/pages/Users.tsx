import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { AppUser, UserRole } from "../supabase";

interface Props { user: AppUser; }

export default function Users({ user }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ name: "", pin: "", role: "cashier" as UserRole, active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("users").select("*").order("name");
    setUsers((data as AppUser[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ name: "", pin: "", role: "cashier", active: true });
    setSelected(null);
    setModal("add");
  };

  const openEdit = (u: AppUser) => {
    setSelected(u);
    setForm({ name: u.name, pin: u.pin, role: u.role, active: u.active });
    setModal("edit");
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg({ type: "err", text: "Name required." }); return; }
    if (!/^\d{4}$/.test(form.pin)) { setMsg({ type: "err", text: "PIN must be exactly 4 digits." }); return; }

    // Login is identity-first (pick your name, then enter your PIN), so a
    // shared PIN can't let one person silently log in as someone else —
    // but it still weakens "every logged action is reliably one specific
    // person," since anyone who knows two names sharing a PIN could guess
    // their way in if they ever needed to. Worth a soft warning, not a hard
    // block, since some shops may genuinely want a shared till PIN.
    const duplicate = users.find(u => u.pin === form.pin && u.id !== selected?.id && u.active);
    if (duplicate) {
      const proceed = confirm(`${duplicate.name} already uses PIN ${form.pin}. Two staff sharing a PIN means actions in the system can't be told apart between them. Use this PIN anyway?`);
      if (!proceed) return;
    }

    setSaving(true);

    if (modal === "add") {
      const { error } = await supabase.from("users").insert({
        name: form.name.trim(), pin: form.pin, role: form.role, active: form.active,
      });
      if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
      setMsg({ type: "ok", text: `${form.name} added!` });
    } else if (selected) {
      const { error } = await supabase.from("users").update({
        name: form.name.trim(), pin: form.pin, role: form.role, active: form.active,
      }).eq("id", selected.id);
      if (error) { setMsg({ type: "err", text: error.message }); setSaving(false); return; }
      setMsg({ type: "ok", text: "Staff updated!" });
    }

    setModal(null);
    await load();
    setSaving(false);
  };

  const toggleActive = async (u: AppUser) => {
    if (u.id === user.id) { setMsg({ type: "err", text: "Cannot deactivate yourself." }); return; }
    await supabase.from("users").update({ active: !u.active }).eq("id", u.id);
    await load();
  };

  const roleColor = (role: string) => {
    if (role === "owner") return "badge-blue";
    if (role === "manager") return "badge-yellow";
    return "badge-green";
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text} <button className="ml-3 opacity-60" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Staff Management</h2>
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
          + Add Staff
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
          {users.map(u => (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${!u.active ? "opacity-50" : ""}`}>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary flex-shrink-0">
                {u.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{u.name}</span>
                  {!u.active && <span className="badge-gray">Inactive</span>}
                  {u.id === user.id && <span className="badge-blue text-xs">You</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={roleColor(u.role)}>{u.role}</span>
                  <span className="text-xs text-muted-foreground">PIN: {"•".repeat(4)}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(u)} className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors">Edit</button>
                {u.id !== user.id && (
                  <button onClick={() => toggleActive(u)} className={`text-xs px-2 py-1 rounded border transition-colors ${u.active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}>
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-10">No staff found.</p>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold mb-4">{modal === "add" ? "Add Staff Member" : "Edit Staff Member"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Aisha Musa" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">4-Digit PIN</label>
                <input type="text" maxLength={4} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 tracking-widest"
                  placeholder="0000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg">
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                Active (can log in)
              </label>
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
