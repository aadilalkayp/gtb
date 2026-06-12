import { Link } from "react-router-dom";
import {
  Users,
  Wallet,
  TrendingUp,
  CalendarClock,
  ShieldAlert,
  PhoneCall,
  Scissors,
  FileWarning,
  UserPlus,
  Clapperboard,
  Star,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  CalendarDays,
  Activity as ActivityIcon,
  Heart,
  ClipboardList,
} from "lucide-react";
import {
  STAFF_ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  formatINR,
  formatDate,
  daysUntil,
  type StaffRole,
  type ServiceType,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { asDate, startOfDay, deriveAtRisk } from "@/lib/insights";
import { StatCard } from "@/components/StatCard";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { useDashboardData, type DashboardMetrics } from "./useDashboardData";
import {
  SectionCard,
  AlertsPanel,
  RevenueChart,
  PipelineFunnel,
  AgendaList,
  WeddingsStrip,
  AtRiskList,
  ActivityFeed,
} from "./widgets";

export function DashboardPage() {
  const { user, role } = useAuth();
  const { isLoading, metrics, raw } = useDashboardData();

  if (isLoading) return <FullPageSpinner />;

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const roleLabel = role && role !== "client" ? STAFF_ROLE_LABELS[role as StaffRole] : "";

  return (
    <div className="space-y-6 p-6">
      {/* Greeting hero */}
      <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-[hsl(var(--sidebar))] via-primary to-primary/80 p-6 text-white shadow-card sm:p-7">
        <Sparkles className="absolute right-6 top-5 h-7 w-7 opacity-30" />
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 right-24 h-44 w-44 rounded-full bg-white/5" />
        <p className="text-sm font-medium opacity-80">
          {greeting}, {firstName}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Here's your {roleLabel} overview
        </h1>
        <p className="mt-2 max-w-xl text-sm opacity-80">
          {formatDate(new Date())} · {summaryLine(metrics)}
        </p>
      </section>

      <RoleView role={role} metrics={metrics} raw={raw} userId={user?.id} />
    </div>
  );
}

function summaryLine(m: DashboardMetrics): string {
  const bits: string[] = [];
  if (m.agenda.length) bits.push(`${m.agenda.length} on today's agenda`);
  if (m.alerts.length)
    bits.push(`${m.alerts.length} active alert${m.alerts.length > 1 ? "s" : ""}`);
  if (m.atRiskClients.length) bits.push(`${m.atRiskClients.length} at risk`);
  return bits.length ? bits.join(" · ") : "Everything's calm — nice work.";
}

function RoleView({
  role,
  metrics,
  raw,
  userId,
}: {
  role: string | null;
  metrics: DashboardMetrics;
  raw: ReturnType<typeof useDashboardData>["raw"];
  userId?: string;
}) {
  switch (role) {
    case "founder":
      return <FounderView m={metrics} />;
    case "ops_head":
      return <OpsView m={metrics} />;
    case "cro":
      return <CroView m={metrics} raw={raw} />;
    case "coach":
      return <CoachView m={metrics} />;
    case "media":
      return <MediaView raw={raw} m={metrics} />;
    case "skincare_consultant":
    case "fitness_trainer":
    case "styling_consultant":
      return <ConsultantView raw={raw} userId={userId} />;
    default:
      return <OpsView m={metrics} />;
  }
}

// ---- Founder ----------------------------------------------------------------

function FounderView({ m }: { m: DashboardMetrics }) {
  const delta =
    m.prevCollections > 0
      ? Math.round(((m.monthCollections - m.prevCollections) / m.prevCollections) * 100)
      : m.monthCollections > 0
        ? 100
        : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Users}
          label="Active clients"
          value={m.activeCount}
          accent="primary"
          footnote={`${m.groomCount} groom · ${m.brideCount} bride`}
        />
        <StatCard
          icon={Wallet}
          label="Revenue this month"
          value={formatINR(m.monthCollections)}
          accent="success"
          delta={{ value: `${Math.abs(delta)}%`, positive: delta >= 0 }}
        />
        <StatCard
          icon={TrendingUp}
          label="Outstanding"
          value={formatINR(m.outstanding)}
          accent="warning"
          footnote={`${formatINR(m.overdueAmount)} overdue`}
        />
        <StatCard
          icon={CalendarClock}
          label="Consultations (7d)"
          value={m.consultationsNext7}
          accent="info"
        />
        <StatCard
          icon={ShieldAlert}
          label="Clients at risk"
          value={m.atRiskClients.length}
          accent="danger"
        />
        <StatCard
          icon={PhoneCall}
          label="Follow-ups today"
          value={m.followupsTodayCount}
          accent="warning"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Revenue vs collections" icon={TrendingUp} className="lg:col-span-2">
          <RevenueChart data={m.revenueSeries} />
        </SectionCard>
        <SectionCard title="Lead pipeline" icon={Users}>
          <PipelineFunnel pipeline={m.pipeline} conversionRate={m.conversionRate} />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Alerts" icon={ShieldAlert}>
          <AlertsPanel alerts={m.alerts} />
        </SectionCard>
        <SectionCard
          title="Today's agenda"
          icon={CalendarDays}
          action={
            <Link to="/consultations" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          <AgendaList agenda={m.agenda} />
        </SectionCard>
        <SectionCard title="Quick stats" icon={ActivityIcon}>
          <QuickStats m={m} />
        </SectionCard>
      </div>

      <SectionCard title="Upcoming weddings" icon={Heart}>
        <WeddingsStrip weddings={m.weddings} />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Clients at risk"
          icon={ShieldAlert}
          action={
            <Link to="/clients" className="text-xs font-medium text-primary hover:underline">
              All clients
            </Link>
          }
        >
          <AtRiskList
            clients={m.atRiskClients.map((c) => ({
              id: c.id,
              name: c.name,
              reasons: deriveAtRisk(c).reasons,
            }))}
          />
        </SectionCard>
        <SectionCard title="Recent activity" icon={ActivityIcon}>
          <ActivityFeed activity={m.activity} />
        </SectionCard>
      </div>
    </>
  );
}

function QuickStats({ m }: { m: DashboardMetrics }) {
  const rows: { label: string; value: string }[] = [
    { label: "Sales this month", value: `${m.salesCount} · ${formatINR(m.salesValue)}` },
    { label: "Collections", value: formatINR(m.monthCollections) },
    { label: "Pending collections", value: formatINR(m.outstanding) },
    { label: "Conversion rate", value: `${(m.conversionRate * 100).toFixed(0)}%` },
    { label: "Media tasks pending", value: String(m.mediaPendingCount) },
    { label: "Active team", value: String(m.activeTeam) },
  ];
  return (
    <dl className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-2.5 text-sm">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-semibold tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Operations Head --------------------------------------------------------

function OpsView({ m }: { m: DashboardMetrics }) {
  const pendingGuides = m.pendingUploads.filter((s) => s.serviceType === "styling").length;
  const pendingPlans = m.pendingUploads.length - pendingGuides;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={CalendarClock}
          label="Consultations (7d)"
          value={m.consultationsNext7}
          accent="info"
        />
        <StatCard icon={FileWarning} label="Pending plans" value={pendingPlans} accent="warning" />
        <StatCard icon={Scissors} label="Pending guides" value={pendingGuides} accent="bride" />
        <StatCard
          icon={PhoneCall}
          label="Follow-ups overdue"
          value={m.followupsOverdueCount}
          accent="warning"
        />
        <StatCard
          icon={UserPlus}
          label="Unassigned clients"
          value={m.unassigned.length}
          accent="danger"
        />
        <StatCard
          icon={ShieldAlert}
          label="Clients at risk"
          value={m.atRiskClients.length}
          accent="danger"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Alerts" icon={ShieldAlert}>
          <AlertsPanel alerts={m.alerts} />
        </SectionCard>
        <SectionCard title="Today's agenda" icon={CalendarDays}>
          <AgendaList agenda={m.agenda} />
        </SectionCard>
        <SectionCard
          title="Unassigned clients"
          icon={UserPlus}
          action={
            <Link to="/assignments" className="text-xs font-medium text-primary hover:underline">
              Assign
            </Link>
          }
        >
          {m.unassigned.length ? (
            <ul className="space-y-2">
              {m.unassigned.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/clients/${c.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm hover:bg-muted/50"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="All assigned"
              hint="Every converted client has a team."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Upcoming weddings" icon={Heart}>
        <WeddingsStrip weddings={m.weddings} />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Clients at risk" icon={ShieldAlert}>
          <AtRiskList
            clients={m.atRiskClients.map((c) => ({
              id: c.id,
              name: c.name,
              reasons: deriveAtRisk(c).reasons,
            }))}
          />
        </SectionCard>
        <SectionCard title="Recent activity" icon={ActivityIcon}>
          <ActivityFeed activity={m.activity} />
        </SectionCard>
      </div>
    </>
  );
}

// ---- CRO --------------------------------------------------------------------

function CroView({
  m,
  raw,
}: {
  m: DashboardMetrics;
  raw: ReturnType<typeof useDashboardData>["raw"];
}) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const myConversions = raw.clients.filter(
    (c) => c.conversionDate && asDate(c.conversionDate) >= monthStart,
  ).length;
  const completedFollowups = raw.followUps.filter((f) => f.status === "completed").length;
  const totalFollowups = raw.followUps.length;
  const completionRate = totalFollowups
    ? Math.round((completedFollowups / totalFollowups) * 100)
    : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={PhoneCall}
          label="Follow-ups today"
          value={m.followupsTodayCount}
          accent="info"
        />
        <StatCard
          icon={CalendarClock}
          label="Overdue follow-ups"
          value={m.followupsOverdueCount}
          accent="warning"
        />
        <StatCard
          icon={TrendingUp}
          label="Conversions this month"
          value={myConversions}
          accent="success"
        />
        <StatCard
          icon={CheckCircle2}
          label="Follow-up completion"
          value={`${completionRate}%`}
          accent="primary"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          title="Due today"
          icon={PhoneCall}
          action={
            <Link to="/cro-tracking" className="text-xs font-medium text-primary hover:underline">
              CRO tracking
            </Link>
          }
        >
          <AgendaList agenda={m.agenda.filter((a) => a.kind === "followup")} />
        </SectionCard>
        <SectionCard title="Alerts" icon={ShieldAlert}>
          <AlertsPanel alerts={m.alerts} />
        </SectionCard>
        <SectionCard title="Clients at risk" icon={ShieldAlert}>
          <AtRiskList
            clients={m.atRiskClients.map((c) => ({
              id: c.id,
              name: c.name,
              reasons: deriveAtRisk(c).reasons,
            }))}
          />
        </SectionCard>
      </div>

      <SectionCard title="Upcoming weddings" icon={Heart}>
        <WeddingsStrip weddings={m.weddings} />
      </SectionCard>
    </>
  );
}

// ---- Consultant -------------------------------------------------------------

function ConsultantView({
  raw,
  userId,
}: {
  raw: ReturnType<typeof useDashboardData>["raw"];
  userId?: string;
}) {
  const today = startOfDay();
  const in7 = startOfDay(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const mine = raw.sessions.filter((s) => s.consultantId === userId || !userId);
  const upcoming = mine
    .filter((s) => {
      if (s.status !== "scheduled" && s.status !== "delayed") return false;
      const d = startOfDay(asDate(s.scheduledDate));
      return d >= today && d <= in7;
    })
    .slice(0, 8);
  const completedThisMonth = mine.filter(
    (s) => s.status === "completed" && s.actualDate && asDate(s.actualDate) >= monthStart,
  ).length;
  const rated = mine.filter((s) => s.rating != null);
  const avgRating = rated.length
    ? (rated.reduce((t, s) => t + (s.rating ?? 0), 0) / rated.length).toFixed(1)
    : "—";
  const pendingUploads = mine.filter((s) => s.status === "completed" && s._count.documents === 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CalendarClock}
          label="Upcoming (7d)"
          value={upcoming.length}
          accent="info"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed this month"
          value={completedThisMonth}
          accent="success"
        />
        <StatCard icon={Star} label="Average rating" value={avgRating} accent="warning" />
        <StatCard
          icon={FileWarning}
          label="Pending uploads"
          value={pendingUploads.length}
          accent="danger"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="My upcoming sessions"
          icon={CalendarDays}
          action={
            <Link to="/consultations" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/consultations"
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50"
                  >
                    <span className="h-9 w-1 shrink-0 rounded-full bg-info" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.client.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {SERVICE_TYPE_LABELS[s.serviceType as ServiceType]} ·{" "}
                        {formatDate(s.scheduledDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {daysUntil(s.scheduledDate) === 0
                        ? "Today"
                        : `${daysUntil(s.scheduledDate)}d`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No upcoming sessions"
              hint="Your next 7 days are clear."
            />
          )}
        </SectionCard>

        <SectionCard title="Pending plan / guide uploads" icon={FileWarning}>
          {pendingUploads.length ? (
            <ul className="space-y-2">
              {pendingUploads.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <Link
                    to="/consultations"
                    className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 p-2.5 hover:bg-warning/10"
                  >
                    <FileWarning className="h-4 w-4 shrink-0 text-[hsl(35_92%_38%)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.client.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {SERVICE_TYPE_LABELS[s.serviceType as ServiceType]} session #
                        {s.sessionNumber}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              hint="Every completed session has its document."
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}

// ---- Coach ------------------------------------------------------------------

function CoachView({ m }: { m: DashboardMetrics }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="My clients" value={m.activeCount} accent="primary" />
        <StatCard
          icon={ShieldAlert}
          label="At risk"
          value={m.atRiskClients.length}
          accent="danger"
        />
        <StatCard icon={ClipboardList} label="Open tasks" value={m.tasksPending} accent="info" />
        <StatCard
          icon={CalendarClock}
          label="Agenda today"
          value={m.agenda.length}
          accent="warning"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Escalations / at risk" icon={ShieldAlert}>
          <AtRiskList
            clients={m.atRiskClients.map((c) => ({
              id: c.id,
              name: c.name,
              reasons: deriveAtRisk(c).reasons,
            }))}
          />
        </SectionCard>
        <SectionCard
          title="Today's agenda"
          icon={CalendarDays}
          action={
            <Link to="/team-tasks" className="text-xs font-medium text-primary hover:underline">
              Tasks
            </Link>
          }
        >
          <AgendaList agenda={m.agenda} />
        </SectionCard>
      </div>

      <SectionCard title="Upcoming milestones" icon={Heart}>
        <WeddingsStrip weddings={m.weddings} />
      </SectionCard>
    </>
  );
}

// ---- Media ------------------------------------------------------------------

function MediaView({
  raw,
  m,
}: {
  raw: ReturnType<typeof useDashboardData>["raw"];
  m: DashboardMetrics;
}) {
  const stages = ["planned", "shooting", "editing", "review", "posted"];
  const byStage = stages.map((s) => ({
    stage: s,
    count: raw.content.filter((c) => c.status === s).length,
  }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Clapperboard}
          label="In production"
          value={m.mediaPendingCount}
          accent="primary"
        />
        <StatCard
          icon={CheckCircle2}
          label="Posted"
          value={raw.content.filter((c) => c.status === "posted").length}
          accent="success"
        />
        <StatCard icon={ClipboardList} label="Open tasks" value={m.tasksPending} accent="info" />
        <StatCard
          icon={CalendarClock}
          label="Total content"
          value={raw.content.length}
          accent="warning"
        />
      </div>

      <SectionCard
        title="Content pipeline"
        icon={Clapperboard}
        action={
          <Link to="/media" className="text-xs font-medium text-primary hover:underline">
            Open board
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {byStage.map((s) => (
            <div key={s.stage} className="rounded-card border border-border p-4 text-center">
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">{s.stage}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

/** Re-exported for the router under a stable name. */
export default DashboardPage;
