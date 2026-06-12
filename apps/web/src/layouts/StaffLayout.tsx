import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Sidebar } from "./Sidebar";
import { NotificationsBell } from "@/components/NotificationsBell";

export function StaffLayout() {
  const { signOut } = useAuth();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-end gap-1 border-b border-border bg-surface px-6">
          <NotificationsBell />
          <button
            onClick={() => void signOut()}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </header>
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
