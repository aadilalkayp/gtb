import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Home, CalendarCheck, ScanFace, Dumbbell, Scissors, Wallet, FileText, User, LogOut } from "lucide-react";
import { CLIENT_TYPE_LABELS } from "@gtb/shared";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ContentSpinner } from "@/components/ui/Spinner";
import { usePortalStyling } from "@/lib/stylingApi";

const CLIENT_NAV: { label: string; short?: string; to: string; icon: typeof Home; end: boolean }[] = [
  { label: "Home", to: "/portal", icon: Home, end: true },
  { label: "Sessions", to: "/portal/sessions", icon: CalendarCheck, end: false },
  { label: "Scan", to: "/portal/scan", icon: ScanFace, end: false },
  { label: "Fitness", to: "/portal/fitness", icon: Dumbbell, end: false },
  // Shown only when styling is part of the client's plan (see ClientLayout).
  { label: "Styling", to: "/portal/styling", icon: Scissors, end: false },
  { label: "Payments", to: "/portal/payments", icon: Wallet, end: false },
  // Eight tabs share the phone's bottom bar, so long labels get a short form.
  { label: "Documents", short: "Docs", to: "/portal/documents", icon: FileText, end: false },
  { label: "Profile", to: "/portal/profile", icon: User, end: false },
];

export function ClientLayout() {
  const { user, signOut } = useAuth();
  const type = user?.client?.type ?? "groom";
  const brand = CLIENT_TYPE_LABELS[type];
  // Styling Blueprint is Groom To Be only for now (GTB, Oct 2026).
  const { data: styling } = usePortalStyling(type === "groom");
  const nav = CLIENT_NAV.filter((item) => item.to !== "/portal/styling" || (type === "groom" && styling?.enabled));

  return (
    <div data-theme={type === "bride" ? "bride" : undefined} className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="GTB" className="h-8 w-8 rounded-lg" />
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
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
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
        <Suspense fallback={<ContentSpinner />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2 text-[10px] font-medium transition-colors duration-150 active:scale-95",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="max-w-full truncate">{item.short ?? item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
