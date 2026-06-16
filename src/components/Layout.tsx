import { useState } from "react";
import type { AppUser } from "../supabase";
import type { Page } from "../App";
import { formatShortDate, formatTime } from "../utils";
import { useEffect } from "react";

interface NavItem {
  id: Page;
  label: string;
  icon: string;
  roles: string[];
}

const NAV: NavItem[] = [
  { id: "dashboard",  label: "Dashboard",    icon: "📊", roles: ["owner","manager","cashier"] },
  { id: "sales",      label: "Sales",         icon: "💳", roles: ["owner","manager","cashier"] },
  { id: "inventory",  label: "Inventory",     icon: "📦", roles: ["owner","manager"] },
  { id: "expenses",   label: "Expenses",      icon: "💰", roles: ["owner","manager"] },
  { id: "credits",    label: "Credits",       icon: "🏦", roles: ["owner","manager","cashier"] },
  { id: "reports",    label: "Reports",       icon: "📈", roles: ["owner","manager"] },
  { id: "suppliers",  label: "Suppliers",     icon: "🚚", roles: ["owner","manager"] },
  { id: "users",      label: "Staff",         icon: "👥", roles: ["owner"] },
  { id: "eod",        label: "End of Day",    icon: "🌙", roles: ["owner","manager","cashier"] },
  { id: "reset",      label: "Clear Data",    icon: "🗑️",  roles: ["owner"] },
];

interface Props {
  user: AppUser;
  page: Page;
  onNavigate: (p: Page) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Layout({ user, page, onNavigate, onLogout, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const allowed = NAV.filter(n => n.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          bg-sidebar text-sidebar-foreground`}
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <span className="text-2xl">⛽</span>
          <div className="min-w-0">
            <div className="font-bold text-sm leading-tight truncate">Jengre Mini Mart</div>
            <div className="text-xs opacity-70 truncate capitalize">{user.role} • {user.name}</div>
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {allowed.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                ${page === item.id
                  ? "bg-white/15 font-semibold"
                  : "hover:bg-white/10 opacity-85 hover:opacity-100"
                }`}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-white/10 transition-colors opacity-80 hover:opacity-100"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-2.5 bg-card border-b border-border flex-shrink-0 shadow-sm">
          <button
            className="lg:hidden p-1.5 rounded hover:bg-muted text-muted-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground text-sm capitalize">
              {NAV.find(n => n.id === page)?.label || "Dashboard"}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatShortDate(now)} • {formatTime(now)}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onNavigate("eod")}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              🌙 End of Day
            </button>
            <div className="text-sm font-medium text-muted-foreground hidden sm:block">
              {user.name}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
