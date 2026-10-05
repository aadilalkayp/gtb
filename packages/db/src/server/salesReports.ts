import type { SalesReport } from "@prisma/client";
import {
  addWorkDays,
  SALES_REPORT_COUNT_FIELDS,
  SALES_REPORT_MAX_CHALLENGES,
  SALES_REPORT_MAX_COUNT,
  workDayKey,
  workDayRange,
  workDayWindow,
  type SalesReportCountKey,
  type SalesReportStatus,
} from "@gtb/shared";
import { prisma } from "../index.js";

/**
 * CRO daily sales reports (SALES_REPORTS_DESIGN.md): status rules, the live
 * sales figures and their credit rule (§6), and the report write. Callers
 * check the role (CRO for their own reports, founder for the team view);
 * nothing here applies access policies.
 */

export interface SalesCro {
  id: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface SalesReportFields {
  dayOff: boolean;
  enquiries: number | null;
  leadFollowUps: number | null;
  hotLeads: number | null;
  plannedFollowUps: number | null;
  challenges: string | null;
  submittedAt: string;
  editedAt: string | null;
}

/** What GTB OS recorded for a CRO on a day (never typed by the CRO). */
export interface SalesFigures {
  leadsAdded: number;
  sales: number;
  /** Sum of agreedPrice over sales that have one. */
  salesValue: number;
  /** Sales whose agreed price is not recorded yet (left out of salesValue). */
  pricePending: number;
  payments: number;
  paymentsReceived: number;
}

export interface SalesDayCell {
  day: string;
  /** null: not expected that day (before the account existed, or in the future). */
  status: SalesReportStatus | null;
  report: SalesReportFields | null;
  figures: SalesFigures;
  /** "Follow-ups planned for tomorrow" from the previous day's report. */
  plannedYesterday: number | null;
}

export interface SalesCroRow {
  cro: SalesCro;
  /** Newest first. */
  days: SalesDayCell[];
}

export interface SalesGrid {
  from: string;
  to: string;
  today: string;
  rows: SalesCroRow[];
  /** Sales and payments credited to nobody (no CRO creator, no CRO assigned). */
  unassigned: Record<string, SalesFigures>;
}

export function emptyFigures(): SalesFigures {
  return { leadsAdded: 0, sales: 0, salesValue: 0, pricePending: 0, payments: 0, paymentsReceived: 0 };
}

export function addFigures(a: SalesFigures, b: SalesFigures): SalesFigures {
  return {
    leadsAdded: a.leadsAdded + b.leadsAdded,
    sales: a.sales + b.sales,
    salesValue: a.salesValue + b.salesValue,
    pricePending: a.pricePending + b.pricePending,
    payments: a.payments + b.payments,
    paymentsReceived: a.paymentsReceived + b.paymentsReceived,
  };
}

function dateOnly(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * A day's status for one CRO (§5). `accountDay` is the work day the CRO's
 * account was created: they are not expected before it.
 */
export function salesReportStatus(
  report: Pick<SalesReport, "dayOff" | "submittedAt"> | null,
  day: string,
  today: string,
  accountDay: string,
): SalesReportStatus | null {
  if (report) {
    if (report.dayOff) return "day_off";
    return report.submittedAt < workDayWindow(day).end ? "submitted" : "late";
  }
  if (day > today || day < accountDay) return null;
  return day === today ? "pending" : "missed";
}

// ---------------------------------------------------------------------------
// Sales credit (§6)
// ---------------------------------------------------------------------------

interface CreditClient {
  createdById: string | null;
  createdBy: { role: string } | null;
  assignments: Array<{ staffId: string; assignedAt: Date; unassignedAt: Date | null; isActive: boolean }>;
}

const CREDIT_CLIENT_SELECT = {
  createdById: true,
  createdBy: { select: { role: true } },
  assignments: {
    where: { role: "cro" as const },
    select: { staffId: true, assignedAt: true, unassignedAt: true, isActive: true },
  },
};

/**
 * The CRO credited with a client's sale and payments: the CRO who created the
 * lead; otherwise the client's CRO assignment covering `at`; otherwise nobody.
 */
export function salesCreditFor(client: CreditClient, at: Date): string | null {
  if (client.createdById && client.createdBy?.role === "cro") return client.createdById;
  const covering = client.assignments
    .filter((a) => {
      if (a.assignedAt > at) return false;
      if (a.unassignedAt) return a.unassignedAt > at;
      // Deactivated without an end time (older data): it can only have covered
      // `at` if nothing replaced it since, which the latest-wins pick handles.
      return true;
    })
    .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime());
  return covering[0]?.staffId ?? null;
}

/** Live figures per CRO per work day over [from, to], plus the uncredited ones. */
export async function computeSalesFigures(
  from: string,
  to: string,
): Promise<{ byCro: Map<string, Map<string, SalesFigures>>; unassigned: Map<string, SalesFigures> }> {
  const start = workDayWindow(from).start;
  const end = workDayWindow(to).end;
  const byCro = new Map<string, Map<string, SalesFigures>>();
  const unassigned = new Map<string, SalesFigures>();
  const bump = (croId: string | null, at: Date, f: (x: SalesFigures) => void) => {
    const day = workDayKey(at);
    let bucket: Map<string, SalesFigures>;
    if (croId) {
      bucket = byCro.get(croId) ?? new Map();
      byCro.set(croId, bucket);
    } else {
      bucket = unassigned;
    }
    const fig = bucket.get(day) ?? emptyFigures();
    f(fig);
    bucket.set(day, fig);
  };

  const [leads, conversions, payments] = await Promise.all([
    prisma.client.findMany({
      where: { createdAt: { gte: start, lt: end }, createdById: { not: null } },
      select: { createdById: true, createdAt: true },
    }),
    prisma.client.findMany({
      where: { conversionDate: { gte: start, lt: end } },
      select: { conversionDate: true, clientPlan: { select: { agreedPrice: true } }, ...CREDIT_CLIENT_SELECT },
    }),
    prisma.payment.findMany({
      where: { kind: "payment", status: "approved", approvedAt: { gte: start, lt: end } },
      select: { amount: true, approvedAt: true, clientPlan: { select: { client: { select: CREDIT_CLIENT_SELECT } } } },
    }),
  ]);

  for (const l of leads) bump(l.createdById, l.createdAt, (f) => (f.leadsAdded += 1));
  for (const c of conversions) {
    const at = c.conversionDate!;
    const price = c.clientPlan?.agreedPrice ?? null;
    bump(salesCreditFor(c, at), at, (f) => {
      f.sales += 1;
      if (price === null) f.pricePending += 1;
      else f.salesValue += price;
    });
  }
  for (const p of payments) {
    const at = p.approvedAt!;
    bump(salesCreditFor(p.clientPlan.client, at), at, (f) => {
      f.payments += 1;
      f.paymentsReceived += p.amount;
    });
  }
  return { byCro, unassigned };
}

// ---------------------------------------------------------------------------
// Grid: every CRO x every day in range
// ---------------------------------------------------------------------------

function toFields(r: SalesReport): SalesReportFields {
  return {
    dayOff: r.dayOff,
    enquiries: r.enquiries,
    leadFollowUps: r.leadFollowUps,
    hotLeads: r.hotLeads,
    plannedFollowUps: r.plannedFollowUps,
    challenges: r.challenges,
    submittedAt: r.submittedAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
  };
}

/**
 * Reports, statuses and live figures for [from, to]. Rows cover active CROs
 * plus any CRO (deactivated, or since moved to another role) who filed a
 * report in the range. `croId` narrows it to one CRO.
 */
export async function salesReportGrid(args: {
  from: string;
  to: string;
  croId?: string;
  now?: Date;
}): Promise<SalesGrid> {
  const { from, to, croId } = args;
  const today = workDayKey(args.now ?? new Date());
  const days = workDayRange(from, to).reverse();

  const reports = await prisma.salesReport.findMany({
    where: {
      day: { gte: dateOnly(addWorkDays(from, -1)), lte: dateOnly(to) },
      ...(croId ? { croId } : {}),
    },
  });
  const reportedIds = [...new Set(reports.filter((r) => dayKeyOf(r.day) >= from).map((r) => r.croId))];
  const cros = await prisma.user.findMany({
    where: croId
      ? { id: croId }
      : { OR: [{ role: "cro", isActive: true }, { id: { in: reportedIds } }] },
    select: { id: true, name: true, avatarUrl: true, isActive: true, role: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  const reportOf = new Map(reports.map((r) => [`${r.croId}|${dayKeyOf(r.day)}`, r]));
  const { byCro, unassigned } = await computeSalesFigures(from, to);

  const rows: SalesCroRow[] = cros.map((u) => {
    // Only a current, active CRO is expected to report; others show what they filed.
    const expected = u.role === "cro" && u.isActive;
    const accountDay = workDayKey(u.createdAt);
    return {
      cro: { id: u.id, name: u.name, avatarUrl: u.avatarUrl, isActive: u.isActive },
      days: days.map((day) => {
        const r = reportOf.get(`${u.id}|${day}`) ?? null;
        const prev = reportOf.get(`${u.id}|${addWorkDays(day, -1)}`);
        return {
          day,
          status: r || expected ? salesReportStatus(r, day, today, accountDay) : null,
          report: r ? toFields(r) : null,
          figures: byCro.get(u.id)?.get(day) ?? emptyFigures(),
          plannedYesterday: prev && !prev.dayOff ? prev.plannedFollowUps : null,
        };
      }),
    };
  });

  return { from, to, today, rows, unassigned: Object.fromEntries(unassigned) };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export class SalesReportError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "SalesReportError";
  }
}

export type SalesReportInput =
  | { dayOff: true }
  | ({ dayOff?: false; challenges?: string | null } & Record<SalesReportCountKey, number>);

/** Validate an untrusted request body into a report input. */
export function parseSalesReportInput(body: unknown): SalesReportInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.dayOff === true) return { dayOff: true };
  const out: Record<string, number> = {};
  for (const f of SALES_REPORT_COUNT_FIELDS) {
    const v = b[f.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > SALES_REPORT_MAX_COUNT) {
      throw new SalesReportError(`${f.label} must be a whole number from 0 to ${SALES_REPORT_MAX_COUNT}`);
    }
    out[f.key] = v;
  }
  let challenges: string | null = null;
  if (b.challenges !== undefined && b.challenges !== null) {
    if (typeof b.challenges !== "string") throw new SalesReportError("Challenges must be text");
    challenges = b.challenges.trim() || null;
    if (challenges && challenges.length > SALES_REPORT_MAX_CHALLENGES) {
      throw new SalesReportError(`Challenges can be at most ${SALES_REPORT_MAX_CHALLENGES} characters`);
    }
  }
  return { ...(out as Record<SalesReportCountKey, number>), challenges, dayOff: false };
}

/**
 * Which days a CRO can still write, and how (§3): today's report can be
 * created and edited until the 4 am deadline; yesterday's can be filed late
 * once, if it was never filed; everything older is closed.
 */
export function salesReportWindow(now: Date = new Date()): { today: string; yesterday: string } {
  const today = workDayKey(now);
  return { today, yesterday: addWorkDays(today, -1) };
}

/** Create or update a CRO's report for `day` (today, or yesterday filed late). */
export async function saveSalesReport(args: {
  croId: string;
  day: string;
  input: SalesReportInput;
  now?: Date;
}): Promise<SalesReport> {
  const now = args.now ?? new Date();
  const { today, yesterday } = salesReportWindow(now);
  const data = args.input.dayOff
    ? { dayOff: true, enquiries: null, leadFollowUps: null, hotLeads: null, plannedFollowUps: null, challenges: null }
    : {
        dayOff: false,
        enquiries: args.input.enquiries,
        leadFollowUps: args.input.leadFollowUps,
        hotLeads: args.input.hotLeads,
        plannedFollowUps: args.input.plannedFollowUps,
        challenges: args.input.challenges ?? null,
      };
  const key = { croId_day: { croId: args.croId, day: dateOnly(args.day) } };

  if (args.day === today) {
    const upsert = () =>
      prisma.salesReport.upsert({
        where: key,
        create: { croId: args.croId, day: dateOnly(args.day), submittedAt: now, ...data },
        update: { ...data, editedAt: now },
      });
    try {
      return await upsert();
    } catch (e) {
      // Two simultaneous first saves: the loser retries as an update.
      if ((e as { code?: string }).code === "P2002") return upsert();
      throw e;
    }
  }
  if (args.day === yesterday) {
    try {
      return await prisma.salesReport.create({
        data: { croId: args.croId, day: dateOnly(args.day), submittedAt: now, ...data },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        throw new SalesReportError("Yesterday's report is already in and can no longer be changed", 409);
      }
      throw e;
    }
  }
  throw new SalesReportError("Reports can only be filed for today, or late for yesterday", 409);
}

// ---------------------------------------------------------------------------
// Founder views
// ---------------------------------------------------------------------------

export interface ReportedTotals {
  enquiries: number;
  leadFollowUps: number;
  hotLeads: number;
  plannedFollowUps: number;
  /** Sum of the previous day's "planned for tomorrow" over the same reports. */
  plannedYesterday: number;
}

function emptyReported(): ReportedTotals {
  return { enquiries: 0, leadFollowUps: 0, hotLeads: 0, plannedFollowUps: 0, plannedYesterday: 0 };
}

function addReported(t: ReportedTotals, c: SalesDayCell): void {
  const r = c.report;
  if (!r || r.dayOff) return;
  t.enquiries += r.enquiries ?? 0;
  t.leadFollowUps += r.leadFollowUps ?? 0;
  t.hotLeads += r.hotLeads ?? 0;
  t.plannedFollowUps += r.plannedFollowUps ?? 0;
  t.plannedYesterday += c.plannedYesterday ?? 0;
}

export interface SalesDayView {
  day: string;
  today: string;
  rows: Array<{ cro: SalesCro; cell: SalesDayCell }>;
  totals: {
    /** CROs expected to report (day offs excluded). */
    expected: number;
    /** Of those, reports in (on time or late). */
    filed: number;
    reported: ReportedTotals;
    /** Team figures, including sales credited to nobody. */
    figures: SalesFigures;
  };
  unassigned: SalesFigures;
}

/** One work day for the founder (§10): every CRO's report next to what GTB OS recorded. */
export async function salesReportDay(day: string, now: Date = new Date()): Promise<SalesDayView> {
  const grid = await salesReportGrid({ from: day, to: day, now });
  const rows = grid.rows.flatMap((r) => (r.days[0] ? [{ cro: r.cro, cell: r.days[0] }] : []));
  const reported = emptyReported();
  let figures = emptyFigures();
  let expected = 0;
  let filed = 0;
  for (const { cell } of rows) {
    addReported(reported, cell);
    figures = addFigures(figures, cell.figures);
    if (cell.status && cell.status !== "day_off") expected += 1;
    if (cell.status === "submitted" || cell.status === "late") filed += 1;
  }
  const unassigned = grid.unassigned[day] ?? emptyFigures();
  return {
    day,
    today: grid.today,
    rows,
    totals: { expected, filed, reported, figures: addFigures(figures, unassigned) },
    unassigned,
  };
}

export interface SalesPeriodRow {
  cro: SalesCro;
  counts: Record<SalesReportStatus, number>;
  /** Reports filed by the deadline, over days that were due (day offs and today excluded). */
  onTimeRate: number | null;
  reported: ReportedTotals;
  figures: SalesFigures;
}

export interface SalesPeriodView {
  from: string;
  to: string;
  today: string;
  rows: SalesPeriodRow[];
  /** Team per day, oldest first: what was reported vs what was recorded. */
  series: Array<{ day: string; enquiries: number; leadsAdded: number; sales: number }>;
  challenges: Array<{ cro: { id: string; name: string }; day: string; text: string; submittedAt: string }>;
  totals: { reported: ReportedTotals; figures: SalesFigures };
  unassigned: SalesFigures;
}

/** Per-CRO totals, submission record, trend and challenges for [from, to] (§10). */
export async function salesReportPeriod(from: string, to: string, now: Date = new Date()): Promise<SalesPeriodView> {
  const grid = await salesReportGrid({ from, to, now });
  const series = new Map<string, { day: string; enquiries: number; leadsAdded: number; sales: number }>();
  for (const day of workDayRange(from, to)) {
    const u = grid.unassigned[day];
    series.set(day, { day, enquiries: 0, leadsAdded: u?.leadsAdded ?? 0, sales: u?.sales ?? 0 });
  }
  const challenges: SalesPeriodView["challenges"] = [];
  const teamReported = emptyReported();
  let teamFigures = emptyFigures();

  const rows = grid.rows.map((r) => {
    const counts: Record<SalesReportStatus, number> = { submitted: 0, late: 0, day_off: 0, pending: 0, missed: 0 };
    const reported = emptyReported();
    let figures = emptyFigures();
    for (const c of r.days) {
      if (c.status) counts[c.status] += 1;
      addReported(reported, c);
      addReported(teamReported, c);
      figures = addFigures(figures, c.figures);
      const s = series.get(c.day);
      if (s) {
        s.enquiries += c.report?.enquiries ?? 0;
        s.leadsAdded += c.figures.leadsAdded;
        s.sales += c.figures.sales;
      }
      if (c.report?.challenges) {
        challenges.push({
          cro: { id: r.cro.id, name: r.cro.name },
          day: c.day,
          text: c.report.challenges,
          submittedAt: c.report.editedAt ?? c.report.submittedAt,
        });
      }
    }
    teamFigures = addFigures(teamFigures, figures);
    const due = counts.submitted + counts.late + counts.missed;
    return { cro: r.cro, counts, onTimeRate: due ? counts.submitted / due : null, reported, figures };
  });

  const unassigned = Object.values(grid.unassigned).reduce(addFigures, emptyFigures());
  challenges.sort((a, b) => (a.day === b.day ? b.submittedAt.localeCompare(a.submittedAt) : b.day.localeCompare(a.day)));
  return {
    from,
    to,
    today: grid.today,
    rows,
    series: [...series.values()],
    challenges,
    totals: { reported: teamReported, figures: addFigures(teamFigures, unassigned) },
    unassigned,
  };
}
