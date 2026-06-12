import { NavLink, Outlet } from "react-router-dom";
import { Home, CalendarCheck, Wallet, FileText, User, LogOut } from "lucide-react";
import { CLIENT_TYPE_LABELS } from "@gtb/shared";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { NotificationsBell } from "@/components/NotificationsBell";

const CLIENT_NAV = [
  { label: "Home", to: "/portal", icon: Home, end: true },
  { label: "Sessions", to: "/portal/sessions", icon: CalendarCheck, end: false },
  { label: "Payments", to: "/portal/payments", icon: Wallet, end: false },
  { label: "Documents", to: "/portal/documents", icon: FileText, end: false },
  { label: "Profile", to: "/portal/profile", icon: User, end: false },
];

export function ClientLayout() {
  const { user, signOut } = useAuth();
  const type = user?.client?.type ?? "groom";
  const brand = CLIENT_TYPE_LABELS[type];

  return (
    <div data-theme={type === "bride" ? "bride" : undefined} className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              {type === "bride" ? "G" : "G"}
            </div>
            <span className="text-sm font-semibold">{brand}</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        {/* Top nav (desktop) */}
        <nav className="mx-auto hidden max-w-3xl gap-1 px-4 sm:flex">
          {CLIENT_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface sm:hidden">
        {CLIENT_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
