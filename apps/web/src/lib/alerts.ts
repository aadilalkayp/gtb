/**
 * Persistent alert derivation (SRS §18.3). Alerts are computed from raw rows at
 * render time — no background job — and shared by the dashboard and the /alerts
 * center. Each alert rolls up a category with a count and drill-down items.
 */
import { asDate, startOfDay, isSameDay, isInstallmentOverdue, deriveAtRisk } from "./insights";

export type AlertSeverity = "danger" | "warning" | "info";

export interface AlertItem {
  kind:
    | "payment_due_today"
    | "consultation_due_today"
    | "styling_tomorrow"
    | "pending_followup"
    | "client_at_risk"
    | "overdue_payments"
    | "no_activity";
  severity: AlertSeverity;
  title: string;
  count: number;
  /** Drill-down rows; each links to the relevant client/record. */
  items: { label: string; sublabel?: string; linkPath: string }[];
}

interface ClientNode {
  id: string;
  name: string;
  status: string;
  sessions: {
    status: string;
    scheduledDate: string | Date;
    actualDate?: string | Date | null;
    rating?: number | null;
  }[];
  installments: { dueDate: string | Date; status: string }[];
  /** Lifetime completed-session count from the server (the session list is a
   *  recent window — see AtRiskInput.totalCompletedSessions). */
  totalCompletedSessions?: number;
}

interface SessionNode {
  id: string;
  scheduledDate: string | Date;
  status: string;
  client: { id: string; name: string };
}

interface StylingNode {
  id: string;
  stylingDate: string | Date | null;
  status: string;
  client: { id: string; name: string };
}

interface FollowUpNode {
  id: string;
  dueDate: string | Date;
  status: string;
  client: { id: string; name: string };
}

export interface AlertInput {
  clients: ClientNode[];
  sessions: SessionNode[];
  stylingOps: StylingNode[];
  followUps: FollowUpNode[];
}

export function deriveAlerts(input: AlertInput): AlertItem[] {
  const today = startOfDay();
  const tomorrow = startOfDay(new Date(today.getTime() + 24 * 60 * 60 * 1000));
  // IST-anchored so this rule and deriveAtRisk can never disagree by a day.
  const sevenDaysAgo = startOfDay(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const out: AlertItem[] = [];

  // Payment due today — pending installment with due_date = today.
  const dueToday = input.clients.flatMap((c) =>
    c.installments
      .filter((i) => i.status === "pending" && isSameDay(i.dueDate, today))
      .map(() => ({
        label: c.name,
        sublabel: "Installment due today",
        linkPath: `/clients/${c.id}`,
      })),
  );
  if (dueToday.length)
    out.push({
      kind: "payment_due_today",
      severity: "warning",
      title: "Payment due today",
      count: dueToday.length,
      items: dueToday,
    });

  // Overdue payments — past due, not approved/waived.
  const overdue = input.clients.flatMap((c) => {
    const n = c.installments.filter(isInstallmentOverdue).length;
    return n
      ? [
          {
            label: c.name,
            sublabel: `${n} installment${n > 1 ? "s" : ""} overdue`,
            linkPath: `/clients/${c.id}`,
          },
        ]
      : [];
  });
  if (overdue.length)
    out.push({
      kind: "overdue_payments",
      severity: "danger",
      title: "Overdue payments",
      count: overdue.length,
      items: overdue,
    });

  // Consultation due today — scheduled session with scheduled_date = today.
  const consultToday = input.sessions
    .filter((s) => s.status === "scheduled" && isSameDay(s.scheduledDate, today))
    .map((s) => ({ label: s.client.name, sublabel: "Session today", linkPath: `/consultations` }));
  if (consultToday.length)
    out.push({
      kind: "consultation_due_today",
      severity: "info",
      title: "Consultations today",
      count: consultToday.length,
      items: consultToday,
    });

  // Styling tomorrow.
  const stylingTomorrow = input.stylingOps
    .filter((o) => o.stylingDate && isSameDay(o.stylingDate, tomorrow) && o.status !== "completed")
    .map((o) => ({
      label: o.client.name,
      sublabel: "Styling tomorrow",
      linkPath: `/styling-operations`,
    }));
  if (stylingTomorrow.length)
    out.push({
      kind: "styling_tomorrow",
      severity: "info",
      title: "Styling tomorrow",
      count: stylingTomorrow.length,
      items: stylingTomorrow,
    });

  // Pending follow-up — past due, not completed.
  const pendingFollow = input.followUps
    .filter((f) => f.status !== "completed" && asDate(f.dueDate) < today)
    .map((f) => ({
      label: f.client.name,
      sublabel: "Follow-up overdue",
      linkPath: `/cro-tracking`,
    }));
  if (pendingFollow.length)
    out.push({
      kind: "pending_followup",
      severity: "warning",
      title: "Pending follow-ups",
      count: pendingFollow.length,
      items: pendingFollow,
    });

  // Client at risk (SRS §13.3).
  const atRisk = input.clients.flatMap((c) => {
    const r = deriveAtRisk(c);
    return r.atRisk
      ? [{ label: c.name, sublabel: r.reasons[0], linkPath: `/clients/${c.id}` }]
      : [];
  });
  if (atRisk.length)
    out.push({
      kind: "client_at_risk",
      severity: "danger",
      title: "Clients at risk",
      count: atRisk.length,
      items: atRisk,
    });

  // No activity 7+ days — active clients with no completed session in 7+ days
  // (CALC-2: freshly-activated clients whose first session hasn't happened yet
  // are never flagged — no more false positives polluting the dashboard).
  const stale = input.clients
    .filter((c) => c.status === "active")
    .filter((c) => {
      const last = c.sessions
        .filter((s) => s.status === "completed")
        .map((s) => asDate(s.actualDate ?? s.scheduledDate).getTime())
        .sort((a, b) => b - a)[0];
      if (last && last >= sevenDaysAgo.getTime()) return false;
      // No completed session in 7+ days: still skip if the program just
      // started (upcoming scheduled sessions exist).
      const hasUpcoming = c.sessions.some((s) => {
        const open = s.status === "scheduled" || s.status === "delayed";
        return open && asDate(s.scheduledDate).getTime() >= today.getTime();
      });
      // "Ever completed" must come from the server count when provided: the
      // fetched session list is a recent window, so a long-dormant client has
      // zero completed sessions IN THE WINDOW while having many overall.
      const hasAnyCompleted =
        (c.totalCompletedSessions ?? c.sessions.filter((s) => s.status === "completed").length) > 0;
      return hasAnyCompleted || !hasUpcoming;
    })
    .map((c) => ({
      label: c.name,
      sublabel: "No session in 7+ days",
      linkPath: `/clients/${c.id}`,
    }));
  if (stale.length)
    out.push({
      kind: "no_activity",
      severity: "warning",
      title: "No activity 7+ days",
      count: stale.length,
      items: stale,
    });

  return out;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Sort most-urgent first for display. */
export function sortAlerts(alerts: AlertItem[]): AlertItem[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count,
  );
}
