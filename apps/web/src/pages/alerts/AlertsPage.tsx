import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  PhoneCall,
  Scissors,
  ShieldAlert,
  Wallet,
  ArrowRight,
  BellRing,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/pages/dashboard/useDashboardData";
import type { AlertItem, AlertSeverity } from "@/lib/alerts";

const ALERT_ICON: Record<AlertItem["kind"], LucideIcon> = {
  payment_due_today: Wallet,
  overdue_payments: AlertTriangle,
  consultation_due_today: CalendarClock,
  styling_tomorrow: Scissors,
  pending_followup: PhoneCall,
  client_at_risk: ShieldAlert,
  no_activity: Clock,
};

const SEVERITY: Record<AlertSeverity, { ring: string; chip: string; label: string }> = {
  danger: { ring: "border-danger/30", chip: "bg-danger/10 text-danger", label: "Urgent" },
  warning: {
    ring: "border-warning/40",
    chip: "bg-warning/15 text-[hsl(35_92%_38%)]",
    label: "Attention",
  },
  info: { ring: "border-info/30", chip: "bg-info/10 text-info", label: "Heads-up" },
};

export function AlertsPage() {
  const { isLoading, metrics } = useDashboardData();
  if (isLoading) return <FullPageSpinner />;

  const alerts = metrics.alerts;
  const totalItems = alerts.reduce((t, a) => t + a.count, 0);
  const counts = {
    danger: alerts.filter((a) => a.severity === "danger").reduce((t, a) => t + a.count, 0),
    warning: alerts.filter((a) => a.severity === "warning").reduce((t, a) => t + a.count, 0),
    info: alerts.filter((a) => a.severity === "info").reduce((t, a) => t + a.count, 0),
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Alerts"
        subtitle="Everything that needs attention, derived live from the latest data."
      />

      {!alerts.length ? (
        <div className="mt-8">
          <EmptyState
            icon={CheckCircle2}
            title="All clear"
            hint="No payments due, overdue items, or at-risk clients right now."
          />
        </div>
      ) : (
        <>
          {/* Severity summary */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {(["danger", "warning", "info"] as AlertSeverity[]).map((sev) => (
              <div key={sev} className={cn("card flex items-center gap-3 p-4", SEVERITY[sev].ring)}>
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    SEVERITY[sev].chip,
                  )}
                >
                  <BellRing className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-bold leading-none">{counts[sev]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{SEVERITY[sev].label}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {totalItems} items across {alerts.length} categories
          </p>

          <div className="mt-3 space-y-4">
            {alerts.map((a) => {
              const Icon = ALERT_ICON[a.kind];
              const style = SEVERITY[a.severity];
              return (
                <section key={a.kind} className={cn("card overflow-hidden p-0", style.ring)}>
                  <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        style.chip,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="flex-1 text-sm font-semibold">{a.title}</h2>
                    <span
                      className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", style.chip)}
                    >
                      {a.count}
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {a.items.map((it, idx) => (
                      <li key={idx}>
                        <Link
                          to={it.linkPath}
                          className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted/50"
                        >
                          <span className="truncate font-medium">{it.label}</span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            {it.sublabel}
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
