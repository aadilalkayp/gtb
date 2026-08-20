import { formatDate, istAddDays, istStartOfDay } from "@gtb/shared";
import { prisma } from "../index.js";

export interface DailyJobReport {
  installmentsMarkedOverdue: number;
  followUpsMarkedOverdue: number;
  sessionRemindersSent: number;
  paymentReminderFollowUpsCreated: number;
  satisfactionCheckFollowUpsCreated: number;
  stylingRemindersSent: number;
  taskOverdueNotifications: number;
}

interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  linkPath?: string;
}

/**
 * SYS-2: the daily automation pass (SRS §8.6 overdue flips, §9.3 session
 * reminders, §12.1/§12.3 follow-up auto-generation, §18.2 notifications).
 *
 * Source-of-truth decision (DATA-6): `overdue` IS a stored status, set here —
 * the UI predicates (CALC-6) are aligned to it in Phase 5.
 *
 * All day boundaries are IST (SRS §22.6): the API commonly runs on a UTC host,
 * where local-time `setHours(0,…)` math shifts every "tomorrow"/"due today"
 * window by a day. Every notification/follow-up creation is de-duplicated (a
 * daily job must be idempotent even if the scheduler double-fires).
 */
export async function runDailyJobs(): Promise<DailyJobReport> {
  const now = new Date();
  const todayStart = istStartOfDay(now);
  const report: DailyJobReport = {
    installmentsMarkedOverdue: 0,
    followUpsMarkedOverdue: 0,
    sessionRemindersSent: 0,
    paymentReminderFollowUpsCreated: 0,
    satisfactionCheckFollowUpsCreated: 0,
    stylingRemindersSent: 0,
    taskOverdueNotifications: 0,
  };

  // 1. Overdue installments: a due date passed without payment → `overdue`
  //    (SRS §8.6 "due date passed"). Strictly earlier IST days only — an
  //    installment due today is not yet overdue. proof_submitted is under
  //    review — not overdue.
  const overdueRes = await prisma.installment.updateMany({
    where: { dueDate: { lt: todayStart }, status: "pending" },
    data: { status: "overdue" },
  });
  report.installmentsMarkedOverdue = overdueRes.count;

  // 2. Overdue follow-ups (SRS §12.4) — same strictly-past-day rule.
  const fupRes = await prisma.followUp.updateMany({
    where: { dueDate: { lt: todayStart }, status: "pending" },
    data: { status: "overdue" },
  });
  report.followUpsMarkedOverdue = fupRes.count;

  // 3. Session reminders — one day before (SRS §9.3).
  const tomorrowStart = istAddDays(todayStart, 1);
  const sessions = await prisma.session.findMany({
    where: {
      scheduledDate: { gte: tomorrowStart, lt: istAddDays(tomorrowStart, 1) },
      status: { in: ["scheduled", "delayed"] },
    },
    include: {
      client: { select: { userId: true, name: true } },
      consultant: { select: { id: true } },
    },
  });
  for (const s of sessions) {
    const targets = [s.client.userId, s.consultant?.id].filter(Boolean) as string[];
    // The session id in the linkPath keys the per-day dedupe per session — a
    // consultant with three sessions tomorrow gets three reminders, not one.
    const sent = await notifyOncePerDay(targets, {
      type: "session_reminder",
      title: "Session tomorrow",
      body: `Your ${s.serviceType} session #${s.sessionNumber} (${s.client.name}) is tomorrow.`,
      linkPath: `/portal/sessions?session=${s.id}`,
    });
    report.sessionRemindersSent += sent;
  }

  // 4. Payment-reminder follow-ups: 3 days before the due date and on the due
  //    date (SRS §12.1). The dedupe key is the human-readable auto-note (client
  //    + installment due day + which reminder), so each installment produces at
  //    most one advance reminder and one due-day reminder — regardless of how
  //    often the job runs or whether the CRO already completed the earlier one.
  //    (Keying on "no open reminder" regenerated a fresh follow-up every day
  //    once the CRO completed the previous one.)
  const dueWindows = [
    { range: { gte: istAddDays(todayStart, 2), lt: istAddDays(todayStart, 4) }, kind: "upcoming" },
    { range: { gte: todayStart, lt: istAddDays(todayStart, 1) }, kind: "due today" },
  ] as const;
  for (const { range, kind } of dueWindows) {
    const installments = await prisma.installment.findMany({
      where: {
        dueDate: range,
        status: { in: ["pending", "overdue"] },
      },
      include: {
        clientPlan: { select: { client: { select: { id: true, status: true } } } },
      },
    });
    for (const i of installments) {
      const client = i.clientPlan.client;
      if (client.status !== "active" && client.status !== "converted" && client.status !== "on_hold") {
        continue; // no payment reminders for leads
      }
      const marker = `Auto: installment due ${formatDate(i.dueDate)} (${kind})`;
      const dup = await prisma.followUp.findFirst({
        where: { clientId: client.id, type: "payment_reminder", notes: marker },
        select: { id: true },
      });
      if (dup) continue;
      const cro = await prisma.assignment.findFirst({
        where: { clientId: client.id, role: "cro", isActive: true },
        select: { staffId: true },
      });
      if (!cro) continue;
      await prisma.followUp.create({
        data: {
          clientId: client.id,
          croId: cro.staffId,
          type: "payment_reminder",
          dueDate: kind === "upcoming" ? istStartOfDay(i.dueDate) : todayStart,
          notes: marker,
        },
      });
      report.paymentReminderFollowUpsCreated += 1;
    }
  }

  // 5. Satisfaction-check follow-ups after every 3rd completed session (§12.1).
  const clients = await prisma.client.findMany({
    where: { status: { in: ["active", "converted", "on_hold"] } },
    include: {
      _count: { select: { sessions: { where: { status: "completed" } } } },
      assignments: { where: { role: "cro", isActive: true }, select: { staffId: true } },
    },
  });
  for (const c of clients) {
    const completed = c._count.sessions;
    if (completed === 0 || completed % 3 !== 0) continue;
    // The guard is keyed to the milestone, not to open-ness: one check per
    // 3rd-session milestone. ("No pending check" regenerated a new follow-up
    // every day between the CRO completing one and the next session.)
    const marker = `Auto: satisfaction check after session ${completed}`;
    const dup = await prisma.followUp.findFirst({
      where: { clientId: c.id, type: "satisfaction_check", notes: marker },
      select: { id: true },
    });
    if (dup) continue;
    const cro = c.assignments[0];
    if (!cro) continue;
    await prisma.followUp.create({
      data: {
        clientId: c.id,
        croId: cro.staffId,
        type: "satisfaction_check",
        dueDate: istAddDays(todayStart, 1),
        notes: marker,
      },
    });
    report.satisfactionCheckFollowUpsCreated += 1;
  }

  // 6. Styling operations within 7 days (SRS §18.2).
  const stylings = await prisma.stylingOperation.findMany({
    where: {
      stylingDate: { gte: todayStart, lt: istAddDays(todayStart, 7) },
      status: { in: ["upcoming", "in_progress"] },
    },
    include: {
      client: { select: { name: true } },
      stylist: { select: { id: true } },
    },
  });
  for (const o of stylings) {
    const stylist = o.stylist?.id;
    const targets = stylist ? [stylist] : [];
    const sent = await notifyOncePerDay(targets, {
      type: "styling_upcoming",
      title: "Styling operation soon",
      body: `Styling for ${o.client.name} is within 7 days.`,
      linkPath: `/styling?op=${o.id}`,
    });
    report.stylingRemindersSent += sent;
  }

  // 7. Overdue tasks (SRS §18.2).
  const tasks = await prisma.task.findMany({
    where: { dueDate: { lt: todayStart }, status: { in: ["pending", "in_progress"] } },
    select: { id: true, title: true, assignedToId: true, assignedById: true },
  });
  for (const t of tasks) {
    const sent = await notifyOncePerDay([t.assignedToId, t.assignedById], {
      type: "task_overdue",
      title: "Task overdue",
      body: `"${t.title}" is past its due date.`,
      linkPath: `/tasks?task=${t.id}`,
    });
    report.taskOverdueNotifications += sent;
  }

  return report;
}

/** Notify once per day per user: skips users who already got this exact
 *  (type + linkPath) notification today. Callers put the entity id in the
 *  linkPath so distinct entities never collapse into one notification.
 *  "Today" is the IST calendar day. Returns how many rows were created. */
async function notifyOncePerDay(userIds: string[], input: NotificationInput): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  const existing = await prisma.notification.findMany({
    where: {
      userId: { in: unique },
      type: input.type,
      linkPath: input.linkPath ?? null,
      createdAt: { gte: istStartOfDay(new Date()) },
    },
    select: { userId: true },
  });
  const already = new Set(existing.map((n) => n.userId));
  const pending = unique.filter((id) => !already.has(id));
  if (pending.length === 0) return 0;
  await prisma.notification.createMany({
    data: pending.map((userId) => ({ userId, ...input })),
  });
  return pending.length;
}
