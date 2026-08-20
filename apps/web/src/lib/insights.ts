/**
 * Client-side business-rule derivations (SRS §8.6, §13.2–13.3, §18.3).
 *
 * Overdue and at-risk are *derived* from raw rows at render time rather than
 * stored, so they're always current without a background job. Inputs are the
 * shapes returned by the generated hooks (dates may arrive as strings).
 */

export type DateLike = Date | string;

/** MISC-9: the business runs on IST (SRS §22.6) — all day math is IST-pinned. */
const BUSINESS_TZ = "Asia/Kolkata";

export function asDate(d: DateLike): Date {
  return typeof d === "string" ? new Date(d) : d;
}

/** The calendar date (y/m/d) a timestamp shows in the business timezone (IST). */
function istParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** Midnight (UTC) of today in the business timezone — a day anchor that is
 *  identical for every viewer, wherever their browser clock is set. */
export function startOfDay(d: Date = new Date()): Date {
  const p = istParts(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.day));
}

export function isSameDay(a: DateLike, b: Date = new Date()): boolean {
  const pa = istParts(asDate(a));
  const pb = istParts(b);
  return pa.y === pb.y && pa.m === pb.m && pa.day === pb.day;
}

/**
 * THE shared overdue predicate (CALC-6): past its due date and not settled
 * (approved/waived). Used by the profile badge, the counts, the alerts, and
 * the portal — everywhere, so they can never disagree. SRS §18.3 "past due
 * date, not approved".
 */
export function isInstallmentOverdue(i: { dueDate: DateLike; status: string }): boolean {
  if (i.status === "approved" || i.status === "waived") return false;
  return asDate(i.dueDate).getTime() < startOfDay().getTime();
}

/** Display status for an installment — maps derived-overdue onto the stored status. */
export function installmentDisplayStatus(i: { dueDate: DateLike; status: string }): string {
  if (isInstallmentOverdue(i)) return "overdue";
  return i.status;
}

export interface SessionLite {
  status: string;
  scheduledDate: DateLike;
  actualDate?: DateLike | null;
  rating?: number | null;
}

export interface AtRiskInput {
  status: string;
  sessions: SessionLite[];
  installments: { dueDate: DateLike; status: string }[];
  /** Lifetime completed-session count from the server. The dashboard fetches
   *  only a recent window of sessions, so "has this client ever completed a
   *  session?" cannot be derived from the windowed list — without this, a
   *  long-dormant client with a future session on the books looks "just
   *  started" and is silently skipped by the at-risk rules. */
  totalCompletedSessions?: number;
}

export interface AtRiskResult {
  atRisk: boolean;
  reasons: string[];
}

/** SRS §13.3 at-risk rules. Only Active clients are evaluated. */
export function deriveAtRisk(client: AtRiskInput): AtRiskResult {
  const reasons: string[] = [];
  if (client.status !== "active") return { atRisk: false, reasons };

  const completed = client.sessions
    .filter((s) => s.status === "completed")
    .sort(
      (a, b) =>
        asDate(b.actualDate ?? b.scheduledDate).getTime() -
        asDate(a.actualDate ?? a.scheduledDate).getTime(),
    );

  // CALC-7: average whatever ratings exist among the last 3 (≥1 rated) —
  // SRS §13.3 "average rating across last 3 sessions below 3.0".
  const last3 = completed.slice(0, 3);
  const rated = last3.filter((s) => s.rating != null);
  if (rated.length >= 1) {
    const avg = rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length;
    if (avg < 3) reasons.push(`Low recent ratings (${avg.toFixed(1)}★)`);
  }

  // CALC-2: "no activity 7+ days while active" — a client whose first session
  // hasn't happened yet (freshly activated with upcoming sessions) is never
  // flagged; the anchor is the last completed session.
  const hasUpcoming = client.sessions.some((s) => {
    const open = s.status === "scheduled" || s.status === "delayed";
    return open && asDate(s.scheduledDate).getTime() >= startOfDay().getTime();
  });
  const lastCompletedAt = completed[0]
    ? asDate(completed[0].actualDate ?? completed[0].scheduledDate)
    : null;
  const sevenDaysAgo = startOfDay(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const everCompleted = client.totalCompletedSessions ?? completed.length;
  const justStarted = everCompleted === 0 && hasUpcoming;
  if (!justStarted && (!lastCompletedAt || lastCompletedAt < sevenDaysAgo)) {
    reasons.push("No completed session in 7+ days");
  }

  const overdueCount = client.installments.filter(isInstallmentOverdue).length;
  if (overdueCount >= 2) reasons.push(`${overdueCount} overdue payments`);

  if (last3.length === 3 && last3.every((s) => s.rating == null)) {
    reasons.push("Last 3 sessions unrated");
  }

  return { atRisk: reasons.length > 0, reasons };
}

/** Average of non-null ratings, or null when nothing is rated yet. */
export function averageRating(sessions: { rating?: number | null }[]): number | null {
  const rated = sessions.filter((s) => s.rating != null);
  if (rated.length === 0) return null;
  return rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length;
}

/** The IST calendar year + 0-based month a timestamp falls in. Use this — not
 *  `getFullYear()/getMonth()` — for month bucketing: the local getters shift a
 *  UTC-midnight-of-an-IST-day timestamp into the previous day (and, at a month
 *  boundary, the previous month) for any viewer west of UTC. */
export function istYearMonth(d: DateLike): { year: number; month: number } {
  const p = istParts(asDate(d));
  return { year: p.y, month: p.m - 1 };
}

/** IST day-of-month of a timestamp (1-31). */
export function istDayOfMonth(d: DateLike): number {
  return istParts(asDate(d)).day;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "May '26", "Jun '26"… keys for the last `n` months including the current one
 *  (IST months). CALC-12: the year is included so a 12-month window spanning a
 *  year boundary never shows two identical "Aug" ticks. */
export function lastMonths(
  n: number,
): { key: string; label: string; year: number; month: number }[] {
  const out: { key: string; label: string; year: number; month: number }[] = [];
  const now = istYearMonth(new Date());
  for (let i = n - 1; i >= 0; i--) {
    // Date arithmetic on (year, month - i) normalises across year boundaries.
    const d = new Date(Date.UTC(now.year, now.month - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    out.push({
      key: `${year}-${month}`,
      label: `${MONTH_SHORT[month]} '${String(year).slice(2)}`,
      year,
      month,
    });
  }
  return out;
}

export function monthKey(d: DateLike): string {
  const { year, month } = istYearMonth(d);
  return `${year}-${month}`;
}

/** Download rows as a CSV file (report exports). */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
