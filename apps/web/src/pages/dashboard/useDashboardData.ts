import { useMemo } from "react";
import {
  useFindManyClient,
  useFindManySession,
  useFindManyFollowUp,
  useFindManyStylingOperation,
  useFindManyTask,
  useFindManyContentItem,
  useFindManyUser,
} from "@gtb/db/hooks";
import {
  asDate,
  startOfDay,
  isSameDay,
  isInstallmentOverdue,
  istDayOfMonth,
  istYearMonth,
  deriveAtRisk,
  lastMonths,
} from "@/lib/insights";
import { deriveAlerts, sortAlerts, type AlertItem } from "@/lib/alerts";

// ---- Raw row shapes (subset of what the generated hooks return) ------------

interface InstallmentLite {
  id: string;
  amount: number;
  dueDate: string | Date;
  status: string;
  approvedAt: string | Date | null;
}
interface ClientRow {
  id: string;
  name: string;
  clientCode: string;
  type: "groom" | "bride";
  status: string;
  leadPhase: string;
  weddingDate: string | Date;
  conversionDate: string | Date | null;
  convertedById: string | null;
  createdAt: string | Date;
  clientPlan: { priceAtEnrollment: number; installments: InstallmentLite[] } | null;
  assignments: { role: string; staffId: string }[];
  _count: { sessions: number }; // lifetime completed sessions (server-side)
}
interface SessionRow {
  id: string;
  serviceType: string;
  sessionNumber: number;
  scheduledDate: string | Date;
  actualDate: string | Date | null;
  status: string;
  rating: number | null;
  consultantId: string | null;
  consultant: { id: string; name: string } | null;
  client: { id: string; name: string; clientCode: string; type: string };
  _count: { documents: number };
}
interface FollowUpRow {
  id: string;
  type: string;
  dueDate: string | Date;
  completedDate: string | Date | null;
  status: string;
  croId: string;
  client: { id: string; name: string };
}
interface StylingRow {
  id: string;
  stylingDate: string | Date | null;
  status: string;
  guideDeliveredAt: string | Date | null;
  stylistId: string | null;
  client: { id: string; name: string };
}
interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  assignedToId: string;
}
interface ContentRow {
  id: string;
  title: string;
  status: string;
  deadline: string | Date | null;
}
export interface PendingUploadRow {
  id: string;
  serviceType: string;
  sessionNumber: number;
  consultantId: string | null;
  status: string;
  client: { id: string; name: string; clientCode: string; type: string };
}

// ---- Derived shapes --------------------------------------------------------

export interface AgendaEntry {
  id: string;
  kind: "session" | "followup" | "styling";
  time: Date;
  title: string;
  sublabel: string;
  linkPath: string;
  accent: string;
}
export interface ActivityEntry {
  id: string;
  when: Date;
  text: string;
  client: string;
  kind: "session" | "payment" | "followup" | "styling";
}
export interface WeddingEntry {
  id: string;
  name: string;
  type: "groom" | "bride";
  date: Date;
  days: number;
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

export function useDashboardData() {
  // PERF-1: freeze the window boundary at mount. A fresh `inDays(-45)` on every
  // render produces a new millisecond-precision Date, which changes the query
  // key each render and drives the session hook into an infinite refetch loop.
  // Flooring to start-of-day also keeps the key stable across the day.
  const sessionsSince = useMemo(() => startOfDay(inDays(-45)), []);

  const clientsQ = useFindManyClient({
    select: {
      id: true,
      name: true,
      clientCode: true,
      type: true,
      status: true,
      leadPhase: true,
      weddingDate: true,
      conversionDate: true,
      convertedById: true, // CALC-5: per-CRO conversion attribution
      createdAt: true,
      clientPlan: {
        select: {
          priceAtEnrollment: true,
          installments: {
            select: { id: true, amount: true, dueDate: true, status: true, approvedAt: true },
          },
        },
      },
      assignments: { where: { isActive: true }, select: { role: true, staffId: true } },
      // Lifetime completed-session count: the session query below is windowed
      // to 45 days, so "has this client ever completed a session?" must come
      // from the server — otherwise a long-dormant client with a future
      // session on the books reads as "just started" and is skipped by the
      // at-risk / no-activity rules (the exact population they exist for).
      _count: { select: { sessions: { where: { status: "completed" } } } },
    },
    orderBy: { weddingDate: "asc" },
  });

  const sessionsQ = useFindManySession({
    include: {
      consultant: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, clientCode: true, type: true } },
      _count: { select: { documents: true } },
    },
    // PERF-1: server-side window — the dashboard only ever reasons about
    // upcoming sessions, today's agenda, and the last-45-days of activity
    // (at-risk "no activity 7+ days" is unaffected: a client whose last
    // session is older than the window IS at risk).
    where: { scheduledDate: { gte: sessionsSince } },
    orderBy: { scheduledDate: "asc" },
  });

  // Completed sessions with no document, regardless of age: the windowed
  // session query above would silently drop a 2-month-old pending upload —
  // the item would just vanish instead of being resolved.
  const pendingUploadsQ = useFindManySession({
    select: {
      id: true,
      serviceType: true,
      sessionNumber: true,
      consultantId: true,
      status: true,
      client: { select: { id: true, name: true, clientCode: true, type: true } },
    },
    where: { status: "completed", documents: { none: {} } },
    orderBy: { actualDate: "desc" },
    take: 100,
  });

  const followUpsQ = useFindManyFollowUp({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  const stylingQ = useFindManyStylingOperation({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { stylingDate: "asc" },
  });

  const tasksQ = useFindManyTask({ orderBy: { dueDate: "asc" } });
  const contentQ = useFindManyContentItem();
  const teamQ = useFindManyUser({
    where: { role: { not: "client" }, isActive: true },
    select: { id: true, name: true, role: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });

  const clients = (clientsQ.data ?? []) as unknown as ClientRow[];
  const sessions = (sessionsQ.data ?? []) as unknown as SessionRow[];
  const pendingUploadRows = (pendingUploadsQ.data ?? []) as unknown as PendingUploadRow[];
  const followUps = (followUpsQ.data ?? []) as unknown as FollowUpRow[];
  const stylingOps = (stylingQ.data ?? []) as unknown as StylingRow[];
  const tasks = (tasksQ.data ?? []) as unknown as TaskRow[];
  const content = (contentQ.data ?? []) as unknown as ContentRow[];
  const team = (teamQ.data ?? []) as unknown as {
    id: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  }[];

  // PERF-2: the dashboard renders nothing until EVERY query has loaded — no
  // more partial-load flash with empty widgets.
  const isLoading =
    clientsQ.isLoading ||
    sessionsQ.isLoading ||
    pendingUploadsQ.isLoading ||
    followUpsQ.isLoading ||
    stylingQ.isLoading ||
    tasksQ.isLoading ||
    contentQ.isLoading ||
    teamQ.isLoading;
  // CALC-8: a failed dashboard query must never render as "all clear".
  const isError =
    clientsQ.isError ||
    sessionsQ.isError ||
    pendingUploadsQ.isError ||
    followUpsQ.isError ||
    stylingQ.isError ||
    tasksQ.isError ||
    contentQ.isError ||
    teamQ.isError;
  const error =
    clientsQ.error ?? sessionsQ.error ?? pendingUploadsQ.error ?? followUpsQ.error ?? stylingQ.error ?? tasksQ.error ?? contentQ.error ?? teamQ.error;

  const metrics = useMemo(() => {
    const today = startOfDay();
    const in7 = startOfDay(inDays(7));
    // MISC-9: month bucketing must use IST parts — local getters on the
    // UTC-midnight-of-IST-day anchor shift a day (and at month boundaries, a
    // month) for any viewer west of UTC.
    const { year: curYear, month: curMonth } = istYearMonth(new Date());
    const dayOfMonth = istDayOfMonth(new Date());

    const sessionsByClient = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const arr = sessionsByClient.get(s.client.id) ?? [];
      arr.push(s);
      sessionsByClient.set(s.client.id, arr);
    }

    // Client nodes for at-risk + alerts (sessions joined from the flat list).
    const clientNodes = clients.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      sessions: (sessionsByClient.get(c.id) ?? []).map((s) => ({
        status: s.status,
        scheduledDate: s.scheduledDate,
        actualDate: s.actualDate,
        rating: s.rating,
      })),
      installments: c.clientPlan?.installments ?? [],
      totalCompletedSessions: c._count?.sessions ?? undefined,
    }));

    const active = clients.filter((c) => c.status === "active");
    const allInstallments = clients.flatMap((c) => c.clientPlan?.installments ?? []);

    const inMonth = (d: string | Date | null, year: number, month: number) => {
      if (d == null) return false;
      const p = istYearMonth(d);
      return p.year === year && p.month === month;
    };
    const inThisMonth = (d: string | Date | null) => inMonth(d, curYear, curMonth);

    const monthCollections = allInstallments
      .filter((i) => i.status === "approved" && inThisMonth(i.approvedAt))
      .reduce((t, i) => t + i.amount, 0);

    // CALC-10: compare the same day-window — the PREVIOUS month's collections
    // through the same day-of-month ("so far vs so far"). The prior version
    // ended the window at *this* month's day-of-month, which put the entire
    // current month inside the "previous month" bucket and double-counted it.
    const prevAnchor = new Date(Date.UTC(curYear, curMonth - 1, 1));
    const [prevYear, prevMonthIdx] = [prevAnchor.getUTCFullYear(), prevAnchor.getUTCMonth()];
    const prevCollections = allInstallments
      .filter((i) => i.status === "approved" && i.approvedAt != null)
      .filter(
        (i) =>
          inMonth(i.approvedAt, prevYear, prevMonthIdx) &&
          istDayOfMonth(i.approvedAt as string | Date) <= dayOfMonth,
      )
      .reduce((t, i) => t + i.amount, 0);

    const outstanding = allInstallments
      .filter((i) => i.status !== "approved" && i.status !== "waived")
      .reduce((t, i) => t + i.amount, 0);

    const overdueAmount = allInstallments
      .filter(isInstallmentOverdue)
      .reduce((t, i) => t + i.amount, 0);

    const openSessions = sessions.filter((s) => s.status === "scheduled" || s.status === "delayed");
    const consultationsNext7 = openSessions.filter((s) => {
      const d = startOfDay(asDate(s.scheduledDate));
      return d >= today && d <= in7;
    });

    const stylingNext7 = stylingOps.filter((o) => {
      if (!o.stylingDate || o.status === "completed") return false;
      const d = startOfDay(asDate(o.stylingDate));
      return d >= today && d <= in7;
    });

    const atRiskClients = clientNodes.filter((c) => deriveAtRisk(c).atRisk);

    const followupsToday = followUps.filter(
      (f) => f.status !== "completed" && isSameDay(f.dueDate, today),
    );
    const followupsOverdue = followUps.filter(
      (f) => f.status !== "completed" && asDate(f.dueDate) < today,
    );

    const mediaPending = content.filter((c) => c.status !== "posted");

    // Sales = conversions this month; conversion rate = converted / leads created this month.
    const salesThisMonthClients = clients.filter((c) => inThisMonth(c.conversionDate));
    const salesValue = salesThisMonthClients.reduce(
      (t, c) => t + (c.clientPlan?.priceAtEnrollment ?? 0),
      0,
    );
    const leadsThisMonth = clients.filter((c) => inThisMonth(c.createdAt));
    // CALC-11: a conversion is a client with a conversionDate in the period —
    // not "status != lead" (a lead created this month then cancelled is NOT a
    // conversion).
    const convertedFromMonth = leadsThisMonth.filter(
      (c) => c.conversionDate != null && inThisMonth(c.conversionDate),
    );
    const conversionRate = leadsThisMonth.length
      ? convertedFromMonth.length / leadsThisMonth.length
      : 0;

    // Revenue series — last 6 months: booked sales vs collections.
    const revenueSeries = lastMonths(6).map((m) => ({
      label: m.label,
      sales: clients
        .filter((c) => inMonth(c.conversionDate, m.year, m.month))
        .reduce((t, c) => t + (c.clientPlan?.priceAtEnrollment ?? 0), 0),
      collections: allInstallments
        .filter((i) => i.status === "approved" && inMonth(i.approvedAt, m.year, m.month))
        .reduce((t, i) => t + i.amount, 0),
    }));

    const pipeline = {
      lead: clients.filter((c) => c.status === "lead").length,
      converted: clients.filter((c) => c.status === "converted").length,
      active: active.length,
    };

    // Today's agenda (sessions today + follow-ups today + styling tomorrow).
    const tomorrow = startOfDay(inDays(1));
    const agenda: AgendaEntry[] = [
      ...openSessions
        .filter((s) => isSameDay(s.scheduledDate, today))
        .map((s) => ({
          id: `s-${s.id}`,
          kind: "session" as const,
          time: asDate(s.scheduledDate),
          title: s.client.name,
          sublabel: `${s.serviceType} session #${s.sessionNumber}`,
          linkPath: "/consultations",
          accent: "bg-info",
        })),
      ...followUps
        .filter((f) => f.status !== "completed" && isSameDay(f.dueDate, today))
        .map((f) => ({
          id: `f-${f.id}`,
          kind: "followup" as const,
          time: asDate(f.dueDate),
          title: f.client.name,
          sublabel: "Follow-up due",
          linkPath: "/cro-tracking",
          accent: "bg-warning",
        })),
      ...stylingOps
        .filter(
          (o) => o.stylingDate && isSameDay(o.stylingDate, tomorrow) && o.status !== "completed",
        )
        .map((o) => ({
          id: `o-${o.id}`,
          kind: "styling" as const,
          time: asDate(o.stylingDate as string | Date),
          title: o.client.name,
          sublabel: "Styling tomorrow",
          linkPath: "/styling-operations",
          accent: "bg-bride",
        })),
    ];

    // Upcoming weddings (converted/active, future-first).
    const weddings: WeddingEntry[] = clients
      .filter((c) => c.status === "active" || c.status === "converted")
      .map((c) => {
        const date = asDate(c.weddingDate);
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          date,
          days: Math.ceil((startOfDay(date).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)),
        };
      })
      .filter((w) => w.days >= 0)
      .sort((a, b) => a.days - b.days);

    // Pending plan/guide uploads — completed sessions with no document, from
    // the dedicated unwindowed query (the 45-day session window would silently
    // drop older unresolved uploads).
    const pendingUploads = pendingUploadRows;

    // Unassigned converted clients (no active consultant assignment).
    const unassigned = clients.filter(
      (c) => c.status === "converted" && c.assignments.length === 0,
    );

    // Recent activity (synthesised from real rows).
    const activity: ActivityEntry[] = [
      ...sessions
        .filter((s) => s.status === "completed" && s.actualDate)
        .map((s) => ({
          id: `as-${s.id}`,
          when: asDate(s.actualDate as string | Date),
          text: `${s.serviceType} session completed`,
          client: s.client.name,
          kind: "session" as const,
        })),
      ...clients.flatMap((c) =>
        (c.clientPlan?.installments ?? [])
          .filter((i) => i.status === "approved" && i.approvedAt)
          .map((i) => ({
            id: `ap-${i.id}`,
            when: asDate(i.approvedAt as string | Date),
            text: `Payment approved`,
            client: c.name,
            kind: "payment" as const,
          })),
      ),
      ...followUps
        .filter((f) => f.status === "completed" && f.completedDate)
        .map((f) => ({
          id: `af-${f.id}`,
          when: asDate(f.completedDate as string | Date),
          text: `Follow-up completed`,
          client: f.client.name,
          kind: "followup" as const,
        })),
      ...stylingOps
        .filter((o) => o.guideDeliveredAt)
        .map((o) => ({
          id: `ao-${o.id}`,
          when: asDate(o.guideDeliveredAt as string | Date),
          text: `Styling guide delivered`,
          client: o.client.name,
          kind: "styling" as const,
        })),
    ]
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .slice(0, 12);

    const alerts: AlertItem[] = sortAlerts(
      deriveAlerts({
        clients: clientNodes,
        sessions: sessions.map((s) => ({
          id: s.id,
          scheduledDate: s.scheduledDate,
          status: s.status,
          client: s.client,
        })),
        stylingOps: stylingOps.map((o) => ({
          id: o.id,
          stylingDate: o.stylingDate,
          status: o.status,
          client: o.client,
        })),
        followUps: followUps.map((f) => ({
          id: f.id,
          dueDate: f.dueDate,
          status: f.status,
          client: f.client,
        })),
      }),
    );

    return {
      activeCount: active.length,
      groomCount: active.filter((c) => c.type === "groom").length,
      brideCount: active.filter((c) => c.type === "bride").length,
      monthCollections,
      prevCollections,
      outstanding,
      overdueAmount,
      consultationsNext7: consultationsNext7.length,
      stylingNext7: stylingNext7.length,
      atRiskClients,
      followupsTodayCount: followupsToday.length,
      followupsOverdueCount: followupsOverdue.length,
      mediaPendingCount: mediaPending.length,
      salesCount: salesThisMonthClients.length,
      salesValue,
      conversionRate,
      activeTeam: team.length,
      revenueSeries,
      pipeline,
      agenda,
      weddings,
      pendingUploads,
      unassigned,
      activity,
      alerts,
      tasksPending: tasks.filter((t) => t.status === "pending" || t.status === "in_progress")
        .length,
    };
  }, [clients, sessions, pendingUploadRows, followUps, stylingOps, tasks, content, team]);

  return {
    isLoading,
    isError,
    error,
    metrics,
    raw: { clients, sessions, pendingUploads: pendingUploadRows, followUps, stylingOps, tasks, content, team },
  };
}

export type DashboardMetrics = ReturnType<typeof useDashboardData>["metrics"];
