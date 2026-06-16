import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { AppUser } from "../supabase";

interface Props {
  onLogin: (user: AppUser) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    supabase
      .from("users")
      .select("id, name, role, pin, active")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          setFetchError("DB error: " + error.message);
        } else {
          setUsers((data as AppUser[]) || []);
        }
        setLoading(false);
      });
  }, []);

  const handleSelect = (u: AppUser) => {
    setSelected(u);
    setPin("");
    setError("");
  };

  const handlePin = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      if (!selected) return;
      if (!selected.pin) {
        setTimeout(() => {
          setError("No PIN set for this user. Ask the owner to set one.");
          setPin("");
        }, 200);
        return;
      }
      if (next === selected.pin) {
        onLogin(selected);
      } else {
        setTimeout(() => {
          setError("Wrong PIN. Try again.");
          setPin("");
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    setPin(p => p.slice(0, -1));
    setError("");
  };

  const roleColor = (role: string) => {
    if (role === "owner") return "bg-purple-100 text-purple-700 border-purple-200";
    if (role === "manager") return "bg-blue-100 text-blue-700 border-blue-200";
    return "bg-green-100 text-green-700 border-green-200";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="text-white text-lg animate-pulse">Loading MartTrack…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⛽</div>
          <h1 className="text-2xl font-bold text-white">MartTrack</h1>
          <p className="text-white/60 text-sm mt-1">Jengre Mini Mart</p>
        </div>

        {fetchError && (
          <div className="bg-red-100 border border-red-300 text-red-700 text-xs rounded-xl px-4 py-3 mb-4 text-center">
            {fetchError}
          </div>
        )}

        {!selected ? (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-semibold text-foreground mb-4">Who are you?</h2>
            <div className="space-y-2">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleSelect(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary hover:bg-green-50 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground flex-shrink-0">
                    {u.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{u.name}</div>
                    <span className={`text-xs capitalize px-2 py-0.5 rounded-full border ${roleColor(u.role)}`}>
                      {u.role}
                    </span>
                  </div>
                  <span className="text-muted-foreground">›</span>
                </button>
              ))}
              {users.length === 0 && !fetchError && (
                <p className="text-center text-muted-foreground text-sm py-4">
                  No active staff found.<br />
                  <span className="text-xs">Run the SQL setup in Supabase first, then set staff to active.</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <button
              onClick={() => { setSelected(null); setPin(""); setError(""); }}
              className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
            >
              ← Back
            </button>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700 mx-auto mb-2">
                {selected.name[0].toUpperCase()}
              </div>
              <div className="font-semibold">{selected.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{selected.role}</div>
            </div>

            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < pin.length
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/40"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-destructive text-xs text-center mb-3">{error}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (d === "⌫") handleBackspace();
                    else if (d) handlePin(d);
                  }}
                  disabled={!d}
                  className={`h-12 rounded-xl text-lg font-semibold transition-all
                    ${!d ? "invisible" : ""}
                    ${d === "⌫"
                      ? "bg-muted text-muted-foreground hover:bg-muted/80"
                      : "bg-muted hover:bg-primary hover:text-white active:scale-95"
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
