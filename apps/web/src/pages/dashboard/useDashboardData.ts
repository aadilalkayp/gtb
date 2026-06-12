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
  createdAt: string | Date;
  clientPlan: { priceAtEnrollment: number; installments: InstallmentLite[] } | null;
  assignments: { role: string; staffId: string }[];
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
    },
    orderBy: { weddingDate: "asc" },
  });

  const sessionsQ = useFindManySession({
    include: {
      consultant: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, clientCode: true, type: true } },
      _count: { select: { documents: true } },
    },
    orderBy: { scheduledDate: "asc" },
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

  const isLoading = clientsQ.isLoading || sessionsQ.isLoading;

  const metrics = useMemo(() => {
    const today = startOfDay();
    const in7 = startOfDay(inDays(7));
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

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
    }));

    const active = clients.filter((c) => c.status === "active");
    const allInstallments = clients.flatMap((c) => c.clientPlan?.installments ?? []);

    const inThisMonth = (d: string | Date | null) => d != null && asDate(d) >= monthStart;
    const inMonth = (d: string | Date | null, year: number, month: number) => {
      if (d == null) return false;
      const x = asDate(d);
      return x.getFullYear() === year && x.getMonth() === month;
    };

    const monthCollections = allInstallments
      .filter((i) => i.status === "approved" && inThisMonth(i.approvedAt))
      .reduce((t, i) => t + i.amount, 0);

    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevCollections = allInstallments
      .filter(
        (i) =>
          i.status === "approved" &&
          inMonth(i.approvedAt, prevMonth.getFullYear(), prevMonth.getMonth()),
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
    const convertedFromMonth = leadsThisMonth.filter((c) => c.status !== "lead");
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

    // Pending plan/guide uploads — completed sessions with no document.
    const pendingUploads = sessions.filter(
      (s) => s.status === "completed" && s._count.documents === 0,
    );

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
  }, [clients, sessions, followUps, stylingOps, tasks, content, team]);

  return {
    isLoading,
    metrics,
    raw: { clients, sessions, followUps, stylingOps, tasks, content, team },
  };
}

export type DashboardMetrics = ReturnType<typeof useDashboardData>["metrics"];
