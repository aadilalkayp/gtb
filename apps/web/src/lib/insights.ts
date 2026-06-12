/**
 * Client-side business-rule derivations (SRS §8.6, §13.2–13.3, §18.3).
 *
 * Overdue and at-risk are *derived* from raw rows at render time rather than
 * stored, so they're always current without a background job. Inputs are the
 * shapes returned by the generated hooks (dates may arrive as strings).
 */

export type DateLike = Date | string;

export function asDate(d: DateLike): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: DateLike, b: Date = new Date()): boolean {
  const d = asDate(a);
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}

/** An installment counts as overdue when its due date passed without approval/waiver. */
export function isInstallmentOverdue(i: { dueDate: DateLike; status: string }): boolean {
  if (i.status === "approved" || i.status === "waived") return false;
  return asDate(i.dueDate) < startOfDay();
}

/** Display status for an installment — maps derived-overdue onto the stored status. */
export function installmentDisplayStatus(i: { dueDate: DateLike; status: string }): string {
  if ((i.status === "pending" || i.status === "rejected") && isInstallmentOverdue(i)) {
    return "overdue";
  }
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

  const last3 = completed.slice(0, 3);
  const rated = last3.filter((s) => s.rating != null);
  if (rated.length === 3) {
    const avg = rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length;
    if (avg < 3) reasons.push(`Low recent ratings (${avg.toFixed(1)}★)`);
  }

  const lastCompletedAt = completed[0]
    ? asDate(completed[0].actualDate ?? completed[0].scheduledDate)
    : null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (!lastCompletedAt || lastCompletedAt < sevenDaysAgo) {
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

/** "May", "Jun"… keys for the last `n` months including the current one. */
export function lastMonths(
  n: number,
): { key: string; label: string; year: number; month: number }[] {
  const out: { key: string; label: string; year: number; month: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return out;
}

export function monthKey(d: DateLike): string {
  const date = asDate(d);
  return `${date.getFullYear()}-${date.getMonth()}`;
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
