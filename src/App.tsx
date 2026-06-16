import { useState, useEffect } from "react";
import Layout from "./components/Layout";
import LoginScreen from "./pages/LoginScreen";
import Dashboard from "./pages/Dashboard";
import SalesEntry from "./pages/SalesEntry";
import Inventory from "./pages/Inventory";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Credits from "./pages/Credits";
import Suppliers from "./pages/Suppliers";
import EndOfDay from "./pages/EndOfDay";
import ResetData from "./pages/ResetData";
import type { AppUser } from "./supabase";

export type Page =
  | "dashboard"
  | "sales"
  | "inventory"
  | "expenses"
  | "reports"
  | "users"
  | "credits"
  | "suppliers"
  | "eod"
  | "reset";

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("marttrack_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppUser;
        // Validate the stored session has all required fields
        if (parsed && parsed.id && parsed.name && parsed.role && parsed.pin) {
          setUser(parsed);
        } else {
          // Stale/invalid session — force re-login
          localStorage.removeItem("marttrack_user");
        }
      } catch {
        localStorage.removeItem("marttrack_user");
      }
    }
    setReady(true);
  }, []);

  const login = (u: AppUser) => {
    setUser(u);
    localStorage.setItem("marttrack_user", JSON.stringify(u));
    setPage("dashboard");
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("marttrack_user");
    setPage("dashboard");
  };

  // Don't render anything until we've checked localStorage
  if (!ready) return null;

  if (!user) {
    return <LoginScreen onLogin={login} />;
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard":   return <Dashboard user={user} />;
      case "sales":       return <SalesEntry user={user} />;
      case "inventory":   return <Inventory user={user} />;
      case "expenses":    return <Expenses user={user} />;
      case "reports":     return <Reports user={user} />;
      case "users":       return <Users user={user} />;
      case "credits":     return <Credits user={user} />;
      case "suppliers":   return <Suppliers user={user} />;
      case "eod":         return <EndOfDay user={user} />;
      case "reset":       return <ResetData user={user} onNavigate={setPage} />;
      default:            return <Dashboard user={user} />;
    }
  };

  return (
    <Layout user={user} page={page} onNavigate={setPage} onLogout={logout}>
      {renderPage()}
    </Layout>
  );
}

export default App;
