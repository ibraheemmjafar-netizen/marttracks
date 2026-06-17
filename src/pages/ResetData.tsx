import { useState } from "react";
import { supabase } from "../supabase";
import type { AppUser } from "../supabase";
import type { Page } from "../App";
import { formatNaira, todayStr } from "../utils";

interface Props { user: AppUser; onNavigate: (p: Page) => void; }
type Step = "confirm" | "pin" | "backing_up" | "backed_up" | "deleting" | "done" | "restore";

export default function ResetData({ user, onNavigate }: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [backup, setBackup] = useState<Record<string, unknown[]> | null>(null);
  const [progress, setProgress] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  if (user.role !== "owner") {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold mb-2">Owner Only</h2>
        <p className="text-muted-foreground text-sm">This feature is restricted to the owner account.</p>
        <button onClick={() => onNavigate("dashboard")} className="mt-6 px-5 py-2.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const handlePinDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      if (next === user.pin) {
        setPinError("");
        setStep("backing_up");
        doBackup();
      } else {
        setTimeout(() => { setPinError("Wrong PIN. Try again."); setPin(""); }, 200);
      }
    }
  };

  const doBackup = async () => {
    setProgress("Exporting sales data…");
    const [txns, sales, expenses, credits, restocks, stockCounts] = await Promise.all([
      supabase.from("sale_transactions").select("*"),
      supabase.from("sales").select("*"),
      supabase.from("expenses").select("*"),
      supabase.from("credits").select("*"),
      supabase.from("restocks").select("*"),
      supabase.from("stock_counts").select("*"),
    ]);

    const data = {
      exported_at: new Date().toISOString(),
      exported_by: user.name,
      sale_transactions: txns.data || [],
      sales: sales.data || [],
      expenses: expenses.data || [],
      credits: credits.data || [],
      restocks: restocks.data || [],
      stock_counts: stockCounts.data || [],
    };

    setBackup(data as unknown as Record<string, unknown[]>);
    setProgress("");
    setStep("backed_up");
  };

  const downloadBackup = () => {
    if (!backup) return;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marttrack-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doClearData = async () => {
    setStep("deleting");
    const tables = ["sales", "sale_transactions", "expenses", "stock_counts", "restocks"];
    for (const table of tables) {
      setProgress(`Clearing ${table}…`);
      await supabase.from(table).delete().gte("id", "00000000-0000-0000-0000-000000000000");
    }
    setProgress("Resetting stock to opening levels…");
    const { data: products } = await supabase.from("products").select("id, open_stock");
    if (products) {
      for (const p of products as any[]) {
        await supabase.from("products").update({ current_stock: p.open_stock }).eq("id", p.id);
      }
    }
    setProgress("");
    setStep("done");
  };

  const doRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const text = await restoreFile.text();
      const data = JSON.parse(text);
      const tableMap: Record<string, string> = {
        sale_transactions: "sale_transactions",
        sales: "sales",
        expenses: "expenses",
        credits: "credits",
        restocks: "restocks",
        stock_counts: "stock_counts",
      };
      for (const [key, table] of Object.entries(tableMap)) {
        const rows = data[key];
        if (Array.isArray(rows) && rows.length > 0) {
          const chunks: any[][] = [];
          for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
          for (const chunk of chunks) {
            await supabase.from(table).upsert(chunk, { onConflict: "id" });
          }
        }
      }
      setRestoreMsg({ type: "ok", text: `Restored! ${data.sale_transactions?.length || 0} transactions, ${data.expenses?.length || 0} expenses recovered.` });
    } catch {
      setRestoreMsg({ type: "err", text: "Invalid backup file. Make sure it's a MartTrack .json backup." });
    }
    setRestoring(false);
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="font-semibold text-red-800 text-sm">Dangerous Action</div>
            <div className="text-xs text-red-700 mt-1">
              This will permanently delete all sales, expenses, and restock records for a fresh start.
              Products, staff accounts, suppliers, and <strong>outstanding customer credit balances are preserved</strong> —
              clearing test data should never make the system forget that a real customer owes money.
              <br />A backup will be exported first.
            </div>
          </div>
        </div>
      </div>

      {step === "confirm" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Clear All Operational Data</h3>
          <p className="text-sm text-muted-foreground">
            This action clears: sales records, sale transactions, expenses, restocks, and stock count history.
            Stock levels will be reset to their opening quantities. Customer credit balances are left untouched.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => onNavigate("dashboard")} className="py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={() => setStep("pin")} className="py-2.5 bg-destructive text-white text-sm font-medium rounded-lg hover:bg-destructive/90 transition-colors">
              Continue to Confirm
            </button>
          </div>
        </div>
      )}

      {step === "pin" && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold text-center mb-2">Enter Your Owner PIN</h3>
          <p className="text-xs text-center text-muted-foreground mb-6">Confirm it&apos;s you, {user.name}</p>
          <div className="flex justify-center gap-3 mb-5">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? "bg-destructive border-destructive" : "border-muted-foreground/40"}`} />
            ))}
          </div>
          {pinError && <p className="text-destructive text-xs text-center mb-3">{pinError}</p>}
          <div className="grid grid-cols-3 gap-2 max-w-48 mx-auto">
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
              <button key={i} disabled={!d}
                onClick={() => { if (d === "⌫") { setPin(p => p.slice(0,-1)); setPinError(""); } else if (d) handlePinDigit(d); }}
                className={`h-12 rounded-xl text-lg font-semibold transition-all ${!d ? "invisible" : d === "⌫" ? "bg-muted text-muted-foreground hover:bg-muted/80" : "bg-muted hover:bg-destructive hover:text-white active:scale-95"}`}>
                {d}
              </button>
            ))}
          </div>
          <button onClick={() => { setStep("confirm"); setPin(""); setPinError(""); }} className="mt-5 w-full text-sm text-muted-foreground hover:text-foreground">
            ← Cancel
          </button>
        </div>
      )}

      {(step === "backing_up") && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="font-medium text-sm">{progress || "Backing up data…"}</div>
        </div>
      )}

      {step === "backed_up" && backup && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="text-center">
            <div className="text-3xl mb-2">📦</div>
            <h3 className="font-semibold">Backup Ready</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {(backup.sale_transactions as unknown[])?.length || 0} transactions,{" "}
              {(backup.expenses as unknown[])?.length || 0} expenses,{" "}
              {(backup.restocks as unknown[])?.length || 0} restocks exported.
            </p>
          </div>
          <button onClick={downloadBackup}
            className="w-full py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            ⬇️ Download Backup File (save this!)
          </button>
          <div className="border border-red-200 rounded-xl p-4 bg-red-50">
            <div className="text-sm font-semibold text-red-800 mb-2">Ready to clear all data?</div>
            <div className="text-xs text-red-700 mb-3">
              Once deleted, data <strong>cannot be recovered</strong> without the backup file.
              Make sure you downloaded the backup above before proceeding.
            </div>
            <div className="flex gap-2">
              <button onClick={() => onNavigate("dashboard")} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">
                Keep Data
              </button>
              <button onClick={doClearData} className="flex-1 py-2.5 bg-destructive text-white text-sm font-medium rounded-lg hover:bg-destructive/90">
                🗑️ Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "deleting" && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-4 border-destructive border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="font-medium text-sm">{progress || "Clearing data…"}</div>
        </div>
      )}

      {step === "done" && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="font-semibold">Data Cleared Successfully</h3>
          <p className="text-sm text-muted-foreground mt-2">
            All sales, expenses, and restock records have been deleted.
            Stock levels reset to opening quantities. Customer credit balances were left untouched.
          </p>
          <div className="flex gap-3 mt-5 justify-center">
            <button onClick={() => setStep("restore")} className="px-4 py-2.5 border border-border text-sm rounded-lg hover:bg-muted">
              Restore from Backup
            </button>
            <button onClick={() => onNavigate("dashboard")} className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {step === "restore" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Restore from Backup</h3>
          <p className="text-sm text-muted-foreground">
            Select a MartTrack backup JSON file. Existing records will be kept — backup records are merged in.
          </p>
          {restoreMsg && (
            <div className={`px-4 py-3 rounded-lg text-sm ${restoreMsg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {restoreMsg.text}
            </div>
          )}
          <input type="file" accept=".json"
            onChange={e => setRestoreFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90" />
          <div className="flex gap-2">
            <button onClick={() => { setStep("done"); setRestoreMsg(null); }} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
            <button onClick={doRestore} disabled={!restoreFile || restoring}
              className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {restoring ? "Restoring…" : "Restore Backup"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
