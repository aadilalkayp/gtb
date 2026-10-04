import type { Prisma, Role } from "@prisma/client";
import {
  addWorkDays,
  describeActivity,
  formatDurationMinutes,
  formatINR,
  workDayClockMinutes,
  workDayKey,
  workDayRange,
  workDayWindow,
  type ActivityDescription,
} from "@gtb/shared";
import { prisma } from "../index.js";

/**
 * Team Pulse read side (TEAM_PULSE_DESIGN.md §7, §8): everything the founder
 * dashboard and the report export show, computed server-side from
 * ActivityLog, StaffDay and ActiveMinute. Callers must have checked that the
 * requester is a founder; nothing here applies access policies.
 */

export interface PulseStaff {
  id: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface PulseMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

export interface PulseSummary {
  daysActive: number;
  /** Clock minutes after IST midnight (see workDayClockMinutes); null with no days. */
  avgStart: number | null;
  avgEnd: number | null;
  totalActiveMinutes: number;
  avgActiveMinutesPerDay: number;
  actions: number;
  views: number;
}

export interface PulseDayStats {
  day: string;
  firstSeenAt: string;
  lastSeenAt: string;
  activeMinutes: number;
  /** [start, end) ISO instants of consecutive active minutes. */
  blocks: Array<[string, string]>;
}

/** Staff whose activity Team Pulse shows: every role except founder and client. */
export async function listTrackedStaff(): Promise<PulseStaff[]> {
  return prisma.user.findMany({
    where: { role: { notIn: ["founder", "client"] } },
    select: { id: true, name: true, role: true, avatarUrl: true, isActive: true },
    orderBy: { name: "asc" },
  });
}

function dateOnly(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Consecutive active minutes (a single missing minute is bridged) as blocks. */
function toBlocks(minutes: Date[]): Array<[string, string]> {
  const blocks: Array<[string, string]> = [];
  let start: number | null = null;
  let last = 0;
  for (const m of minutes) {
    const t = m.getTime();
    if (start !== null && t - last <= 2 * 60_000) {
      last = t;
      continue;
    }
    if (start !== null) blocks.push([new Date(start).toISOString(), new Date(last + 60_000).toISOString()]);
    start = t;
    last = t;
  }
  if (start !== null) blocks.push([new Date(start).toISOString(), new Date(last + 60_000).toISOString()]);
  return blocks;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function pct(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}

function humanHours(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return formatDurationMinutes(ms / 60_000);
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** End of the IST calendar day containing `d` (deadlines count the whole day). */
function endOfIstDay(d: Date): Date {
  const IST = 5.5 * 3_600_000;
  const local = new Date(d.getTime() + IST);
  const end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - IST;
  return new Date(end);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/** Distinct user actions (one request = one action) per user in a window. */
async function actionCounts(userIds: string[], start: Date, end: Date): Promise<Map<string, number>> {
  const rows = await prisma.activityLog.findMany({
    where: { performedById: { in: userIds }, createdAt: { gte: start, lt: end }, kind: { in: ["change", "export"] } },
    select: { id: true, performedById: true, requestId: true },
  });
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.performedById!) ?? new Set<string>();
    set.add(r.requestId ?? r.id);
    out.set(r.performedById!, set);
  }
  return new Map([...out].map(([k, v]) => [k, v.size]));
}

function summarise(
  days: Array<{ firstSeenAt: Date; lastSeenAt: Date; activeMinutes: number; viewCount: number }>,
  actions: number,
): PulseSummary {
  const n = days.length;
  const total = days.reduce((s, d) => s + d.activeMinutes, 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    daysActive: n,
    avgStart: avg(days.map((d) => workDayClockMinutes(d.firstSeenAt))),
    avgEnd: avg(days.map((d) => workDayClockMinutes(d.lastSeenAt))),
    totalActiveMinutes: total,
    avgActiveMinutesPerDay: n ? Math.round(total / n) : 0,
    actions,
    views: days.reduce((s, d) => s + d.viewCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Role outputs and timeliness (§7.2)
// ---------------------------------------------------------------------------

type OutputDef = { key: string; label: string; verbs: string[]; money?: boolean };

const SESSION_OUTPUTS: OutputDef[] = [
  { key: "sessions", label: "Sessions completed", verbs: ["session.completed"] },
  { key: "uploads", label: "Documents uploaded", verbs: ["document.uploaded"] },
];

const ROLE_OUTPUTS: Partial<Record<Role, OutputDef[]>> = {
  cro: [
    { key: "followups", label: "Follow-ups completed", verbs: ["followup.completed"] },
    { key: "leads", label: "Leads added", verbs: ["client.created"] },
    { key: "conversions", label: "Conversions", verbs: ["client.converted"] },
    { key: "payments", label: "Payments recorded", verbs: ["payment.recorded", "payment.approved"], money: true },
  ],
  coach: [
    { key: "followups", label: "Follow-ups completed", verbs: ["followup.completed"] },
    { key: "clientUpdates", label: "Client updates", verbs: ["client.updated", "client.status_changed"] },
  ],
  skincare_consultant: SESSION_OUTPUTS,
  styling_consultant: [
    ...SESSION_OUTPUTS,
    { key: "checklist", label: "Checklist items done", verbs: ["styling.item_done"] },
  ],
  fitness_trainer: [
    ...SESSION_OUTPUTS,
    { key: "logs", label: "Weight and measurement logs", verbs: ["fitness.weight_logged", "fitness.measurements_logged"] },
    { key: "checkins", label: "Check-ins reviewed", verbs: ["fitness.checkin_reviewed"] },
    { key: "notes", label: "Trainer notes", verbs: ["fitness.note_added"] },
  ],
  media: [
    { key: "contentCreated", label: "Content added", verbs: ["content.created"] },
    { key: "contentMoved", label: "Content moved forward", verbs: ["content.moved", "content.posted"] },
    { key: "contentPosted", label: "Posted", verbs: ["content.posted"] },
  ],
  ops_head: [
    { key: "assignments", label: "Assignments made", verbs: ["client.assigned"] },
    { key: "activations", label: "Clients activated", verbs: ["client.activated"] },
    { key: "paymentApprovals", label: "Payments approved", verbs: ["payment.approved", "payment.recorded"], money: true },
    { key: "expenseApprovals", label: "Expenses approved", verbs: ["expense.approved"] },
  ],
};

const COMMON_OUTPUTS: OutputDef[] = [{ key: "tasks", label: "Tasks completed", verbs: ["task.completed"] }];

const TIMELINESS_VERBS = [
  "followup.completed",
  "session.completed",
  "fitness.checkin_reviewed",
  "styling.item_done",
  "content.posted",
  "expense.approved",
  "payment.approved",
  "task.completed",
];

export interface StaffMetrics {
  outputs: PulseMetric[];
  timeliness: PulseMetric[];
}

type MetricRow = {
  id: string;
  performedById: string | null;
  verb: string | null;
  entityId: string;
  requestId: string | null;
  createdAt: Date;
  changes: Prisma.JsonValue;
};

function amountOf(changes: Prisma.JsonValue): number {
  const c = (changes ?? {}) as Record<string, unknown>;
  const v = Array.isArray(c.amount) ? c.amount[1] : c.amount;
  return typeof v === "number" ? v : 0;
}

/** Outputs + timeliness for each staff member over [start, end). */
export async function computeStaffMetrics(
  staff: Pick<PulseStaff, "id" | "role">[],
  start: Date,
  end: Date,
): Promise<Map<string, StaffMetrics>> {
  const ids = staff.map((s) => s.id);
  const verbs = new Set<string>(TIMELINESS_VERBS);
  for (const defs of [...Object.values(ROLE_OUTPUTS), COMMON_OUTPUTS]) {
    for (const d of defs ?? []) d.verbs.forEach((v) => verbs.add(v));
  }
  const rows: MetricRow[] = await prisma.activityLog.findMany({
    where: { performedById: { in: ids }, createdAt: { gte: start, lt: end }, verb: { in: [...verbs] } },
    select: { id: true, performedById: true, verb: true, entityId: true, requestId: true, createdAt: true, changes: true },
  });

  // Look up the deadlines the timeliness numbers compare against.
  const idsFor = (verb: string) => [...new Set(rows.filter((r) => r.verb === verb).map((r) => r.entityId))];
  const [followUps, sessions, checkIns, styling, content, expenses, payments, tasks] = await Promise.all([
    prisma.followUp.findMany({ where: { id: { in: idsFor("followup.completed") } }, select: { id: true, dueDate: true } }),
    prisma.session.findMany({ where: { id: { in: idsFor("session.completed") } }, select: { id: true, scheduledDate: true } }),
    prisma.fitnessCheckIn.findMany({
      where: { id: { in: idsFor("fitness.checkin_reviewed") } },
      select: { id: true, createdAt: true },
    }),
    prisma.stylingOperation.findMany({
      where: { id: { in: idsFor("styling.item_done") } },
      select: { id: true, stylingDate: true },
    }),
    prisma.contentItem.findMany({ where: { id: { in: idsFor("content.posted") } }, select: { id: true, deadline: true } }),
    prisma.expense.findMany({ where: { id: { in: idsFor("expense.approved") } }, select: { id: true, createdAt: true } }),
    prisma.payment.findMany({
      where: { id: { in: idsFor("payment.approved") }, submittedById: { not: null } },
      select: { id: true, createdAt: true },
    }),
    prisma.task.findMany({ where: { id: { in: idsFor("task.completed") } }, select: { id: true, dueDate: true } }),
  ]);
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const fuMap = byId(followUps);
  const sesMap = byId(sessions);
  const ciMap = byId(checkIns);
  const styMap = byId(styling);
  const conMap = byId(content);
  const expMap = byId(expenses);
  const payMap = byId(payments);
  const taskMap = byId(tasks);

  const rowsByUser = groupBy(rows, (r) => r.performedById!);
  const out = new Map<string, StaffMetrics>();

  for (const s of staff) {
    const mine = rowsByUser.get(s.id) ?? [];
    const of = (vs: string[]) => {
      // One entity counted once per request (a request can touch it twice).
      const seen = new Map<string, MetricRow>();
      for (const r of mine) if (r.verb && vs.includes(r.verb)) seen.set(`${r.requestId ?? r.id}:${r.entityId}`, r);
      return [...seen.values()];
    };

    const outputs: PulseMetric[] = [...(ROLE_OUTPUTS[s.role] ?? []), ...COMMON_OUTPUTS].map((d) => {
      const hits = of(d.verbs);
      const total = d.money ? hits.reduce((sum, r) => sum + amountOf(r.changes), 0) : 0;
      return {
        key: d.key,
        label: d.label,
        value: String(hits.length),
        hint: d.money && total > 0 ? formatINR(total) : undefined,
      };
    });

    const timeliness: PulseMetric[] = [];
    const onTime = (key: string, label: string, verb: string, deadline: (r: MetricRow) => Date | null | undefined) => {
      const dated = of([verb])
        .map((r) => ({ r, due: deadline(r) }))
        .filter((x): x is { r: MetricRow; due: Date } => x.due instanceof Date);
      if (dated.length === 0) return;
      const late = dated.filter((x) => x.r.createdAt > endOfIstDay(x.due));
      const lateDays = median(late.map((x) => (x.r.createdAt.getTime() - endOfIstDay(x.due).getTime()) / 86_400_000));
      timeliness.push({
        key,
        label,
        value: pct(dated.length - late.length, dated.length),
        hint:
          late.length > 0
            ? `${late.length} of ${dated.length} late, median ${Math.max(1, Math.ceil(lateDays ?? 0))}d`
            : `${dated.length} of ${dated.length}`,
      });
    };
    const turnaround = (key: string, label: string, pairs: Array<[Date, Date]>) => {
      const m = median(pairs.map(([from, to]) => to.getTime() - from.getTime()).filter((x) => x >= 0));
      if (m === null) return;
      timeliness.push({ key, label, value: humanHours(m), hint: `median of ${pairs.length}` });
    };

    if (s.role === "cro" || s.role === "coach") {
      onTime("followupsOnTime", "Follow-ups done by due date", "followup.completed", (r) => fuMap.get(r.entityId)?.dueDate);
    }
    if (s.role === "skincare_consultant" || s.role === "styling_consultant" || s.role === "fitness_trainer") {
      onTime("sessionsSameDay", "Sessions logged the same day", "session.completed", (r) => sesMap.get(r.entityId)?.scheduledDate);
      turnaround(
        "sessionLag",
        "Median time to log a session",
        of(["session.completed"]).flatMap((r) => {
          const due = sesMap.get(r.entityId)?.scheduledDate;
          return due ? [[due, r.createdAt] as [Date, Date]] : [];
        }),
      );
    }
    if (s.role === "fitness_trainer") {
      turnaround(
        "checkinReview",
        "Median check-in review time",
        of(["fitness.checkin_reviewed"]).flatMap((r) => {
          const c = ciMap.get(r.entityId);
          return c ? [[c.createdAt, r.createdAt] as [Date, Date]] : [];
        }),
      );
    }
    if (s.role === "styling_consultant") {
      onTime("stylingOnTime", "Checklist items done before the styling date", "styling.item_done", (r) => styMap.get(r.entityId)?.stylingDate);
    }
    if (s.role === "media") {
      onTime("postedOnTime", "Posted by the deadline", "content.posted", (r) => conMap.get(r.entityId)?.deadline);
    }
    if (s.role === "ops_head") {
      turnaround("approvalTime", "Median approval time", [
        ...of(["expense.approved"]).flatMap((r) => {
          const e = expMap.get(r.entityId);
          return e ? [[e.createdAt, r.createdAt] as [Date, Date]] : [];
        }),
        ...of(["payment.approved"]).flatMap((r) => {
          const p = payMap.get(r.entityId);
          return p ? [[p.createdAt, r.createdAt] as [Date, Date]] : [];
        }),
      ]);
    }
    onTime("tasksOnTime", "Tasks done by due date", "task.completed", (r) => taskMap.get(r.entityId)?.dueDate);

    out.set(s.id, { outputs, timeliness });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Day overview (§8.1 day view)
// ---------------------------------------------------------------------------

export interface PulseDayRow {
  staff: PulseStaff;
  stats: { firstSeenAt: string; lastSeenAt: string; activeMinutes: number; viewCount: number } | null;
  actions: number;
  blocks: Array<[string, string]>;
  ticks: Array<{ at: string; tone: ActivityDescription["tone"] }>;
  outputs: PulseMetric[];
  /** Only for today: active (beat within 2 min) or idle (within 15 min). */
  presence: { state: "active" | "idle"; module: string; since: string } | null;
}

export async function pulseDay(day: string, now: Date = new Date()): Promise<{ day: string; isToday: boolean; rows: PulseDayRow[] }> {
  const { start, end } = workDayWindow(day);
  const staff = await listTrackedStaff();
  const ids = staff.map((s) => s.id);
  const isToday = workDayKey(now) === day;

  const [days, minutes, logs, recent, actions, metrics] = await Promise.all([
    prisma.staffDay.findMany({ where: { userId: { in: ids }, day: dateOnly(day) } }),
    prisma.activeMinute.findMany({
      where: { userId: { in: ids }, minute: { gte: start, lt: end } },
      orderBy: { minute: "asc" },
      select: { userId: true, minute: true },
    }),
    prisma.activityLog.findMany({
      where: { performedById: { in: ids }, createdAt: { gte: start, lt: end }, kind: { in: ["change", "export"] } },
      select: { performedById: true, createdAt: true, verb: true, kind: true, entityType: true, requestId: true, id: true },
      orderBy: { createdAt: "asc" },
    }),
    isToday
      ? prisma.activeMinute.findMany({
          where: { userId: { in: ids }, minute: { gte: new Date(now.getTime() - 16 * 60_000) } },
          orderBy: { minute: "desc" },
        })
      : Promise.resolve([]),
    actionCounts(ids, start, end),
    computeStaffMetrics(staff, start, end),
  ]);

  const dayByUser = new Map(days.map((d) => [d.userId, d]));
  const minutesByUser = groupBy(minutes, (m) => m.userId);
  const logsByUser = groupBy(logs, (l) => l.performedById!);
  const latestByUser = new Map<string, (typeof recent)[number]>();
  for (const m of recent) if (!latestByUser.has(m.userId)) latestByUser.set(m.userId, m);

  const rows: PulseDayRow[] = staff
    .filter((s) => s.isActive || dayByUser.has(s.id))
    .map((s) => {
      const d = dayByUser.get(s.id);
      // One tick per request (a request's several rows share a moment).
      const seen = new Set<string>();
      const ticks = (logsByUser.get(s.id) ?? []).flatMap((l) => {
        const key = l.requestId ?? l.id;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ at: l.createdAt.toISOString(), tone: describeActivity(l).tone }];
      });
      const latest = latestByUser.get(s.id);
      const ageMs = latest ? now.getTime() - latest.minute.getTime() : Infinity;
      return {
        staff: s,
        stats: d
          ? {
              firstSeenAt: d.firstSeenAt.toISOString(),
              lastSeenAt: d.lastSeenAt.toISOString(),
              activeMinutes: d.activeMinutes,
              viewCount: d.viewCount,
            }
          : null,
        actions: actions.get(s.id) ?? 0,
        blocks: toBlocks((minutesByUser.get(s.id) ?? []).map((m) => m.minute)),
        ticks,
        outputs: (metrics.get(s.id)?.outputs ?? []).filter((o) => o.value !== "0"),
        presence:
          latest && ageMs < 15 * 60_000
            ? { state: ageMs < 2 * 60_000 + 30_000 ? "active" : "idle", module: latest.module, since: latest.minute.toISOString() }
            : null,
      };
    });
  return { day, isToday, rows };
}

// ---------------------------------------------------------------------------
// Period overview (§8.1 week/month view)
// ---------------------------------------------------------------------------

export interface PulsePeriodRow {
  staff: PulseStaff;
  byDay: Record<string, number>;
  summary: PulseSummary;
  outputs: PulseMetric[];
  timeliness: PulseMetric[];
}

export async function pulsePeriod(from: string, to: string): Promise<{ from: string; to: string; days: string[]; rows: PulsePeriodRow[] }> {
  const days = workDayRange(from, to);
  const start = workDayWindow(from).start;
  const end = workDayWindow(to).end;
  const staff = await listTrackedStaff();
  const ids = staff.map((s) => s.id);
  const [staffDays, actions, metrics] = await Promise.all([
    prisma.staffDay.findMany({ where: { userId: { in: ids }, day: { gte: dateOnly(from), lte: dateOnly(to) } } }),
    actionCounts(ids, start, end),
    computeStaffMetrics(staff, start, end),
  ]);
  const daysByUser = groupBy(staffDays, (d) => d.userId);
  const rows = staff
    .filter((s) => s.isActive || daysByUser.has(s.id))
    .map((s) => {
      const mine = daysByUser.get(s.id) ?? [];
      return {
        staff: s,
        byDay: Object.fromEntries(mine.map((d) => [dayKeyOf(d.day), d.activeMinutes])),
        summary: summarise(mine, actions.get(s.id) ?? 0),
        outputs: metrics.get(s.id)?.outputs ?? [],
        timeliness: metrics.get(s.id)?.timeliness ?? [],
      };
    });
  return { from, to, days, rows };
}

// ---------------------------------------------------------------------------
// One staff member (§8.2)
// ---------------------------------------------------------------------------

export interface PulseStaffDetail {
  staff: PulseStaff;
  from: string;
  to: string;
  summary: PulseSummary;
  previous: PulseSummary;
  outputs: PulseMetric[];
  timeliness: PulseMetric[];
  modules: Array<{ module: string; minutes: number }>;
  days: PulseDayStats[];
}

/** Blocks are only built for ranges up to this many days (minute data is heavy). */
const MAX_BLOCK_DAYS = 62;

export async function pulseStaff(userId: string, from: string, to: string): Promise<PulseStaffDetail | null> {
  const staff = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, avatarUrl: true, isActive: true },
  });
  if (!staff || staff.role === "founder" || staff.role === "client") return null;

  const span = workDayRange(from, to).length;
  const prevFrom = addWorkDays(from, -span);
  const prevTo = addWorkDays(from, -1);
  const start = workDayWindow(from).start;
  const end = workDayWindow(to).end;

  const [days, prevDays, actions, prevActions, metrics, modules, minutes] = await Promise.all([
    prisma.staffDay.findMany({
      where: { userId, day: { gte: dateOnly(from), lte: dateOnly(to) } },
      orderBy: { day: "desc" },
    }),
    prisma.staffDay.findMany({ where: { userId, day: { gte: dateOnly(prevFrom), lte: dateOnly(prevTo) } } }),
    actionCounts([userId], start, end),
    actionCounts([userId], workDayWindow(prevFrom).start, start),
    computeStaffMetrics([staff], start, end),
    prisma.activeMinute.groupBy({
      by: ["module"],
      where: { userId, minute: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    span <= MAX_BLOCK_DAYS
      ? prisma.activeMinute.findMany({
          where: { userId, minute: { gte: start, lt: end } },
          orderBy: { minute: "asc" },
          select: { minute: true },
        })
      : Promise.resolve([]),
  ]);

  const minutesByDay = groupBy(minutes, (m) => workDayKey(m.minute));
  return {
    staff,
    from,
    to,
    summary: summarise(days, actions.get(userId) ?? 0),
    previous: summarise(prevDays, prevActions.get(userId) ?? 0),
    outputs: metrics.get(userId)?.outputs ?? [],
    timeliness: metrics.get(userId)?.timeliness ?? [],
    modules: modules
      .map((m) => ({ module: m.module, minutes: m._count._all }))
      .sort((a, b) => b.minutes - a.minutes),
    days: days.map((d) => {
      const key = dayKeyOf(d.day);
      return {
        day: key,
        firstSeenAt: d.firstSeenAt.toISOString(),
        lastSeenAt: d.lastSeenAt.toISOString(),
        activeMinutes: d.activeMinutes,
        blocks: toBlocks((minutesByDay.get(key) ?? []).map((m) => m.minute)),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Activity feed (§8.2 log, §8.3 all activity, §8.4 client history)
// ---------------------------------------------------------------------------

export interface PulseFeedFilters {
  userId?: string;
  clientId?: string;
  kinds?: Array<"change" | "view" | "export" | "auth">;
  module?: string;
  q?: string;
  from?: string;
  to?: string;
  /** Founders' own entries are hidden unless asked for (or a client's history). */
  includeFounders?: boolean;
  cursor?: string;
  limit?: number;
  order?: "desc" | "asc";
}

export interface PulseFeedDetail {
  id: string;
  verb: string | null;
  entityType: string;
  changes: Prisma.JsonValue;
  description: ActivityDescription;
}

export interface PulseFeedEntry extends PulseFeedDetail {
  at: string;
  kind: string;
  module: string | null;
  entityId: string;
  summary: string | null;
  meta: Prisma.JsonValue;
  actor: { id: string; name: string; role: Role } | null;
  client: { id: string; name: string } | null;
  /** Generic changes made by the same request, folded under this entry. */
  details: PulseFeedDetail[];
}

const FEED_MAX = 5000;

export async function pulseFeed(f: PulseFeedFilters): Promise<{ entries: PulseFeedEntry[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(f.limit ?? 100, 1), FEED_MAX);
  const order = f.order ?? "desc";
  const and: Prisma.ActivityLogWhereInput[] = [];

  if (f.userId) and.push({ performedById: f.userId });
  if (f.clientId) and.push({ clientId: f.clientId });
  if (!f.userId && !f.clientId) {
    // Team-wide feed: people only (not cron/anonymous), founders on request.
    and.push({ performedById: { not: null } });
    // actorRole is null on rows written before Team Pulse; keep those.
    and.push({
      OR: [{ actorRole: null }, { actorRole: { notIn: f.includeFounders ? ["client"] : ["founder", "client"] } }],
    });
  }
  if (f.kinds?.length) and.push({ kind: { in: f.kinds } });
  if (f.module) and.push({ module: f.module });
  if (f.from) and.push({ createdAt: { gte: workDayWindow(f.from).start } });
  if (f.to) and.push({ createdAt: { lt: workDayWindow(f.to).end } });
  if (f.q?.trim()) {
    const q = f.q.trim();
    const clients = await prisma.client.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 200,
    });
    and.push({
      OR: [
        { clientId: { in: clients.map((c) => c.id) } },
        { verb: { contains: q.toLowerCase().replace(/\s+/g, "") } },
        { summary: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (f.cursor) {
    const [iso, id] = f.cursor.split("_");
    if (iso && id) {
      const at = new Date(iso);
      and.push(
        order === "desc"
          ? { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] }
          : { OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: id } }] },
      );
    }
  }

  const rows = await prisma.activityLog.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: order }, { id: order }],
    take: limit + 1,
    include: { performedBy: { select: { id: true, name: true, role: true } } },
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null;

  const clientIds = [...new Set(page.map((r) => r.clientId).filter((x): x is string => Boolean(x)))];
  const clients = new Map(
    (await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })).map((c) => [c.id, c]),
  );

  // Fold each request's generic changes under its named event (§5.3).
  const isPrimary = (r: (typeof page)[number]) => r.kind !== "change" || r.summary !== null;
  const groups = new Map<string, typeof page>();
  const orderKeys: string[] = [];
  for (const r of page) {
    const key = r.requestId ?? r.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      orderKeys.push(key);
    }
    groups.get(key)!.push(r);
  }

  const toDetail = (r: (typeof page)[number]): PulseFeedDetail => ({
    id: r.id,
    verb: r.verb,
    entityType: r.entityType,
    changes: r.changes,
    description: describeActivity(r),
  });
  const toEntry = (r: (typeof page)[number]): PulseFeedEntry => ({
    ...toDetail(r),
    at: r.createdAt.toISOString(),
    kind: r.kind,
    module: r.module,
    entityId: r.entityId,
    summary: r.summary,
    meta: r.meta,
    actor: r.performedBy,
    client: r.clientId ? (clients.get(r.clientId) ?? null) : null,
    details: [],
  });

  const entries: PulseFeedEntry[] = [];
  for (const key of orderKeys) {
    const group = groups.get(key)!;
    const primaries = group.filter(isPrimary);
    const generic = group.filter((r) => !isPrimary(r));
    if (primaries.length === 0) {
      const [head, ...rest] = generic;
      const e = toEntry(head!);
      e.details = rest.map(toDetail);
      entries.push(e);
      continue;
    }
    const built = primaries.map(toEntry);
    for (const g of generic) {
      const target =
        built.find((e) => e.entityType === g.entityType && e.entityId === g.entityId) ?? built[0]!;
      target.details.push(toDetail(g));
    }
    entries.push(...built);
  }
  return { entries, nextCursor };
}
