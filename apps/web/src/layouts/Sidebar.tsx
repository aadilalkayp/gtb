import { NavLink } from "react-router-dom";
import { STAFF_ROLE_LABELS, type StaffRole } from "@gtb/shared";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { STAFF_NAV } from "./navItems";

export function Sidebar() {
  const { user, role } = useAuth();
  const staffRole = (role && role !== "client" ? role : "founder") as StaffRole;
  const items = STAFF_NAV.filter((i) => i.visible(staffRole));

  return (
    <aside className="flex h-screen w-60 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-active text-sm font-bold">
          GTB
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">GTB OS</p>
          <p className="text-[10px] uppercase tracking-wider text-sidebar-muted">
            Groom · Glow To Be
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-muted hover:bg-sidebar-active/60 hover:text-white",
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      {user && (
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{STAFF_ROLE_LABELS[staffRole]}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
