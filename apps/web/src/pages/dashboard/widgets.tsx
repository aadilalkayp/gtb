import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Heart,
  PhoneCall,
  Scissors,
  ShieldAlert,
  Wallet,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { formatINR, formatDate, humanize } from "@gtb/shared";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import type { AlertItem, AlertSeverity } from "@/lib/alerts";
import type { AgendaEntry, ActivityEntry, WeddingEntry } from "./useDashboardData";

/** Titled card container for a dashboard panel. */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card flex flex-col p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

// ---- Alerts -----------------------------------------------------------------

const ALERT_ICON: Record<AlertItem["kind"], LucideIcon> = {
  payment_due_today: Wallet,
  overdue_payments: AlertTriangle,
  consultation_due_today: CalendarClock,
  styling_tomorrow: Scissors,
  pending_followup: PhoneCall,
  client_at_risk: ShieldAlert,
  no_activity: Clock,
};

const SEVERITY_STYLE: Record<AlertSeverity, { chip: string; text: string }> = {
  danger: { chip: "bg-danger/10 text-danger", text: "text-danger" },
  warning: { chip: "bg-warning/15 text-[hsl(35_92%_38%)]", text: "text-[hsl(35_92%_38%)]" },
  info: { chip: "bg-info/10 text-info", text: "text-info" },
};

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (!alerts.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="All clear"
        hint="No urgent alerts right now. Everything's on track."
      />
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const Icon = ALERT_ICON[a.kind];
        const style = SEVERITY_STYLE[a.severity];
        return (
          <details key={a.kind} className="group rounded-lg border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
              <span
                className={cn("flex h-8 w-8 items-center justify-center rounded-lg", style.chip)}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.count} {a.count === 1 ? "item" : "items"}
                </span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", style.chip)}>
                {a.count}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-border px-3 py-2">
              <ul className="space-y-1">
                {a.items.slice(0, 6).map((it, idx) => (
                  <li key={idx}>
                    <Link
                      to={it.linkPath}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                    >
                      <span className="truncate">{it.label}</span>
                      {it.sublabel && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {it.sublabel}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
                {a.items.length > 6 && (
                  <li className="px-2 pt-1 text-xs text-muted-foreground">
                    +{a.items.length - 6} more
                  </li>
                )}
              </ul>
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ---- Revenue chart ----------------------------------------------------------

function compactINR(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

export function RevenueChart({
  data,
}: {
  data: { label: string; sales: number; collections: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gradCollections" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--info))" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(var(--info))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickFormatter={compactINR}
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatINR(value), humanize(name)]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              fontSize: 13,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
          />
          <Area
            type="monotone"
            dataKey="sales"
            stroke="hsl(var(--info))"
            strokeWidth={2}
            fill="url(#gradSales)"
          />
          <Area
            type="monotone"
            dataKey="collections"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            fill="url(#gradCollections)"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Collections
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-info" /> Sales booked
        </span>
      </div>
    </div>
  );
}

// ---- Pipeline funnel --------------------------------------------------------

export function PipelineFunnel({
  pipeline,
  conversionRate,
}: {
  pipeline: { lead: number; converted: number; active: number };
  conversionRate: number;
}) {
  const stages = [
    { label: "Leads", value: pipeline.lead, color: "bg-info" },
    { label: "Converted", value: pipeline.converted, color: "bg-warning" },
    { label: "Active", value: pipeline.active, color: "bg-success" },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{s.label}</span>
            <span className="text-muted-foreground">{s.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", s.color)}
              style={{ width: `${(s.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Conversion rate (this month)</span>
        <span className="text-sm font-semibold">{(conversionRate * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ---- Agenda -----------------------------------------------------------------

export function AgendaList({ agenda }: { agenda: AgendaEntry[] }) {
  if (!agenda.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        hint="No sessions or follow-ups for today."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {agenda.map((e) => (
        <li key={e.id}>
          <Link
            to={e.linkPath}
            className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50"
          >
            <span className={cn("h-9 w-1 shrink-0 rounded-full", e.accent)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.title}</span>
              <span className="block text-xs capitalize text-muted-foreground">{e.sublabel}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---- Weddings ---------------------------------------------------------------

export function WeddingsStrip({ weddings }: { weddings: WeddingEntry[] }) {
  if (!weddings.length) {
    return (
      <EmptyState
        icon={Heart}
        title="No upcoming weddings"
        hint="Active clients' big days will appear here."
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {weddings.slice(0, 6).map((w) => (
        <Link
          key={w.id}
          to={`/clients/${w.id}`}
          className={cn(
            "relative overflow-hidden rounded-card p-4 text-white shadow-card transition-transform hover:-translate-y-0.5",
            w.type === "bride"
              ? "bg-gradient-to-br from-bride to-bride/70"
              : "bg-gradient-to-br from-groom to-groom/70",
          )}
        >
          <Heart className="absolute -right-3 -top-3 h-16 w-16 rotate-12 opacity-15" />
          <p className="text-3xl font-bold leading-none">{w.days}</p>
          <p className="text-xs opacity-80">days to go</p>
          <p className="mt-3 truncate text-sm font-medium">{w.name}</p>
          <p className="text-xs opacity-80">{formatDate(w.date)}</p>
        </Link>
      ))}
    </div>
  );
}

// ---- At risk ----------------------------------------------------------------

export function AtRiskList({
  clients,
}: {
  clients: { id: string; name: string; reasons?: string[] }[];
}) {
  if (!clients.length) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No clients at risk"
        hint="Everyone's engaged and on track."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {clients.slice(0, 6).map((c) => (
        <li key={c.id}>
          <Link
            to={`/clients/${c.id}`}
            className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 p-2.5 hover:bg-danger/10"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              {c.reasons?.[0] && (
                <span className="block truncate text-xs text-muted-foreground">{c.reasons[0]}</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---- Activity feed ----------------------------------------------------------

const ACTIVITY_DOT: Record<ActivityEntry["kind"], string> = {
  session: "bg-info",
  payment: "bg-success",
  followup: "bg-warning",
  styling: "bg-bride",
};

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  if (!activity.length) {
    return (
      <EmptyState
        icon={Clock}
        title="No recent activity"
        hint="Completed work will show up here."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {activity.map((a) => (
        <li key={a.id} className="flex gap-3">
          <span className="relative mt-1 flex flex-col items-center">
            <span className={cn("h-2.5 w-2.5 rounded-full", ACTIVITY_DOT[a.kind])} />
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-sm">
              <span className="font-medium">{a.client}</span>{" "}
              <span className="text-muted-foreground">— {a.text}</span>
            </p>
            <p className="text-xs text-muted-foreground/80">{timeAgo(a.when)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- Team avatars -----------------------------------------------------------

export function TeamRoster({
  team,
}: {
  team: { id: string; name: string; role: string; avatarUrl: string | null }[];
}) {
  if (!team.length) return <p className="text-sm text-muted-foreground">No team members yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {team.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3"
        >
          <Avatar name={m.name} src={m.avatarUrl} size="sm" className="h-6 w-6 text-[10px]" />
          <span className="text-xs">
            <span className="font-medium">{m.name.split(" ")[0]}</span>{" "}
            <span className="text-muted-foreground">{humanize(m.role)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
