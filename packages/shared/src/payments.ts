/**
 * Flexible-payment derivations (SRS §8 rework).
 *
 * The schedule (PaymentMilestone) and the money (Payment) are decoupled:
 * clients pay any amount at any time, and milestones are CHECKPOINTS — at each
 * due date the client is fine as long as the cumulative amount paid covers the
 * cumulative amount expected. "Overdue"/"behind" is therefore fully derived,
 * never stored, and a client who pays the right totals in odd-sized chunks is
 * never flagged.
 *
 * Pure date/number math — no DB access — shared by the API routes, the cron
 * jobs, and the web/portal UIs so they can never disagree. Callers supply
 * `todayStart` (the IST day anchor: `istStartOfDay` on the server,
 * `startOfDay` from insights on the web).
 */
import type { MilestonePaceStatus } from "./enums.js";

export type DateInput = Date | string;

export interface MilestoneLike {
  amount: number;
  dueDate: DateInput;
}

export interface PaymentLike {
  amount: number;
  /** PaymentStatus — only "approved" rows count toward the balance. */
  status: string;
  /** PaymentKind — "waiver" rows settle balance without being cash. */
  kind?: string | null;
}

const toTime = (d: DateInput): number => (typeof d === "string" ? new Date(d) : d).getTime();

/** Everything approved — payments AND waivers. This is what settles the balance. */
export function approvedTotal(payments: PaymentLike[]): number {
  return payments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + p.amount, 0);
}

/** Approved real money only (waivers excluded) — use for revenue/collections. */
export function approvedCashTotal(payments: PaymentLike[]): number {
  return payments
    .filter((p) => p.status === "approved" && (p.kind ?? "payment") === "payment")
    .reduce((sum, p) => sum + p.amount, 0);
}

/** Submissions awaiting staff review. */
export function pendingReviewTotal(payments: PaymentLike[]): number {
  return payments
    .filter((p) => p.status === "pending_review")
    .reduce((sum, p) => sum + p.amount, 0);
}

/** What the client still owes. Never negative. */
export function planBalance(priceAtEnrollment: number, payments: PaymentLike[]): number {
  return Math.max(priceAtEnrollment - approvedTotal(payments), 0);
}

export interface MilestonePace<M extends MilestoneLike = MilestoneLike> {
  milestone: M;
  /** Total expected once this milestone's date arrives (this one included). */
  cumulativeDue: number;
  /** How much of this milestone is still uncovered by approved payments. */
  remaining: number;
  status: Exclude<MilestonePaceStatus, "due_today">;
}

/**
 * Pace of each milestone against the approved total, in due-date order.
 * A milestone is `paid` when the cumulative expected through it is covered;
 * otherwise `behind` once its due date is strictly past, else `upcoming`.
 * ("due_today" is a display refinement layered on by the UI via isSameDay.)
 */
export function milestonePace<M extends MilestoneLike>(
  milestones: M[],
  payments: PaymentLike[],
  todayStart: Date,
): MilestonePace<M>[] {
  const paid = approvedTotal(payments);
  const ordered = [...milestones].sort((a, b) => toTime(a.dueDate) - toTime(b.dueDate));
  let cumulative = 0;
  return ordered.map((m) => {
    cumulative += m.amount;
    const covered = Math.max(Math.min(paid - (cumulative - m.amount), m.amount), 0);
    const remaining = m.amount - covered;
    const status: MilestonePace["status"] =
      remaining === 0
        ? "paid"
        : toTime(m.dueDate) < todayStart.getTime()
          ? "behind"
          : "upcoming";
    return { milestone: m, cumulativeDue: cumulative, remaining, status };
  });
}

export interface PlanPaymentPace {
  paidTotal: number;
  balance: number;
  /** Amount the client is short of the checkpoints whose dates have passed. */
  behindAmount: number;
  /** Next milestone not yet fully covered (due-date order), with what's left of it. */
  nextDue: { dueDate: DateInput; remaining: number } | null;
  status: "paid_in_full" | "behind" | "on_track";
}

/** Client-level rollup of the milestone pace — the one number staff chase. */
export function planPaymentPace(
  priceAtEnrollment: number,
  milestones: MilestoneLike[],
  payments: PaymentLike[],
  todayStart: Date,
): PlanPaymentPace {
  const paidTotal = approvedTotal(payments);
  const balance = Math.max(priceAtEnrollment - paidTotal, 0);
  const pace = milestonePace(milestones, payments, todayStart);
  const behindAmount = Math.min(
    pace
      .filter((p) => p.status === "behind")
      .reduce((sum, p) => sum + p.remaining, 0),
    balance,
  );
  const next = pace.find((p) => p.remaining > 0);
  return {
    paidTotal,
    balance,
    behindAmount,
    nextDue: next ? { dueDate: next.milestone.dueDate, remaining: next.remaining } : null,
    status: balance === 0 ? "paid_in_full" : behindAmount > 0 ? "behind" : "on_track",
  };
}

/**
 * Validate a proposed milestone schedule against the enrolled price.
 * Returns an error message key or null when valid.
 */
export function validateMilestoneSchedule(
  priceAtEnrollment: number,
  milestones: { amount: number; dueDate: DateInput }[],
): "EMPTY" | "BAD_AMOUNT" | "BAD_DATE" | "SUM_MISMATCH" | null {
  if (milestones.length === 0) return "EMPTY";
  for (const m of milestones) {
    if (!Number.isInteger(m.amount) || m.amount <= 0) return "BAD_AMOUNT";
    if (Number.isNaN(toTime(m.dueDate))) return "BAD_DATE";
  }
  const sum = milestones.reduce((t, m) => t + m.amount, 0);
  if (sum !== priceAtEnrollment) return "SUM_MISMATCH";
  return null;
}
