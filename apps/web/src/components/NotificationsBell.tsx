import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import {
  useFindManyNotification,
  useUpdateNotification,
  useUpdateManyNotification,
} from "@gtb/db/hooks";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";

function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Bell + unread badge + dropdown. Polls every 60s as a light real-time substitute. */
export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: notifications } = useFindManyNotification(
    {
      where: { userId: user?.id ?? "" },
      orderBy: { createdAt: "desc" },
      take: 20,
    },
    { enabled: Boolean(user), refetchInterval: 60_000 },
  );
  const updateOne = useUpdateNotification();
  const updateMany = useUpdateManyNotification();

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function openItem(n: { id: string; isRead: boolean; linkPath: string | null }) {
    if (!n.isRead) {
      void updateOne.mutateAsync({ where: { id: n.id }, data: { isRead: true } });
    }
    setOpen(false);
    if (n.linkPath) navigate(n.linkPath);
  }

  function markAllRead() {
    void updateMany.mutateAsync({
      where: { userId: user?.id ?? "", isRead: false },
      data: { isRead: true },
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-card border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!notifications?.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-muted/60",
                    !n.isRead && "bg-info/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.isRead ? "bg-transparent" : "bg-info",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {n.body}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
