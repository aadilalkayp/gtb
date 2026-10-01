import { PAYMENT_METHODS } from "@gtb/shared";
import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";
import { assertNotOverpaid, PaymentAmountError } from "./paymentApproval.js";

/**
 * Staff corrections to the payment ledger. GTB OS is run by staff, so no
 * payment is ever final: any record can be edited (amount, method, date,
 * notes, payment vs waiver) or moved to another status (back to review,
 * rejected, voided) to fix clerical mistakes. Payments carried over from the
 * old installment model (legacyImported) are the main case: whole
 * installments were approved there even when only part had been paid.
 *
 * Every correction needs a reason, stamps editedAt/editedById for the
 * "Edited" marker, and writes the before/after to the activity log. Balance,
 * pace, reminders and reports are all derived from the ledger, so they follow
 * automatically. Client status is never rolled back (the UI warns instead).
 */

/** A correction that can't be applied as asked; the message is user-facing. */
export class PaymentCorrectionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface PaymentActor {
  id: string;
  role: string;
}

const EDITORS = new Set(["founder", "ops_head", "cro"]);
const ADMINS = new Set(["founder", "ops_head"]);

/** What the caller should do with the payment's receipt PDF afterwards. */
export type ReceiptAction = "regenerate" | "remove" | "none";

async function loadForActor(paymentId: string, actor: PaymentActor) {
  if (!EDITORS.has(actor.role)) throw new Error("FORBIDDEN");
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      clientPlan: {
        select: { id: true, agreedPrice: true, clientId: true },
      },
    },
  });
  if (!payment) throw new Error("NOT_FOUND");
  if (actor.role === "cro") {
    // CROs correct payments only for clients they're actively assigned to,
    // and never waivers (writing off money is a founder/ops call).
    const assigned = await prisma.assignment.findFirst({
      where: {
        clientId: payment.clientPlan.clientId,
        staffId: actor.id,
        role: "cro",
        isActive: true,
      },
      select: { id: true },
    });
    if (!assigned) throw new Error("NOT_ASSIGNED");
    if (payment.kind === "waiver") throw new Error("FORBIDDEN");
  }
  return payment;
}

function requireReason(reason: string | undefined): string {
  const r = reason?.trim();
  if (!r) throw new PaymentCorrectionError("Give a reason for the change");
  return r;
}

export interface EditPaymentInput {
  paymentId: string;
  actor: PaymentActor;
  reason: string;
  amount?: number;
  paymentMethod?: string | null;
  /** When the money was received (stored as approvedAt; approved rows only). */
  paidAt?: Date;
  notes?: string | null;
  kind?: "payment" | "waiver";
}

/** Edit the details of any non-voided payment. */
export async function editPayment(input: EditPaymentInput): Promise<{ receipt: ReceiptAction }> {
  const reason = requireReason(input.reason);
  const payment = await loadForActor(input.paymentId, input.actor);
  if (payment.status === "voided") {
    throw new PaymentCorrectionError("A voided payment can't be edited");
  }

  const kind = input.kind ?? payment.kind;
  if (kind !== payment.kind) {
    if (!ADMINS.has(input.actor.role)) throw new Error("FORBIDDEN");
    if (kind === "waiver" && payment.clientPlan.agreedPrice == null) {
      throw new PaymentCorrectionError("Record the agreed price before waiving any amount");
    }
  }

  const amount = input.amount ?? payment.amount;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PaymentCorrectionError("Amount must be a positive whole number");
  }

  // Waivers carry no method; a real payment that's been approved needs one.
  let paymentMethod =
    input.paymentMethod === undefined ? payment.paymentMethod : input.paymentMethod;
  if (kind === "waiver") paymentMethod = null;
  if (paymentMethod != null && !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new PaymentCorrectionError("Unknown payment method");
  }
  if (kind === "payment" && payment.status === "approved" && paymentMethod == null) {
    throw new PaymentCorrectionError("Choose how the payment was made");
  }

  let approvedAt = payment.approvedAt;
  if (input.paidAt !== undefined) {
    if (payment.status !== "approved") {
      throw new PaymentCorrectionError("Only an approved payment has a received date");
    }
    if (Number.isNaN(input.paidAt.getTime())) {
      throw new PaymentCorrectionError("Enter a valid date");
    }
    if (input.paidAt.getTime() > Date.now()) {
      throw new PaymentCorrectionError("The received date can't be in the future");
    }
    approvedAt = input.paidAt;
  }

  const notes =
    input.notes === undefined ? payment.notes : input.notes?.trim() ? input.notes.trim() : null;

  const before = {
    amount: payment.amount,
    kind: payment.kind,
    paymentMethod: payment.paymentMethod,
    approvedAt: payment.approvedAt,
    notes: payment.notes,
  };
  const after = { amount, kind, paymentMethod, approvedAt, notes };
  const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
    (k) => String(before[k] ?? "") !== String(after[k] ?? ""),
  );
  if (changed.length === 0) throw new PaymentCorrectionError("Nothing was changed");

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        amount,
        kind: kind as never,
        paymentMethod: paymentMethod as never,
        approvedAt,
        notes,
        editedAt: new Date(),
        editedById: input.actor.id,
      },
    });
    // An edit can't push approved money past the agreed price.
    if (payment.status === "approved") {
      try {
        await assertNotOverpaid(tx, payment.clientPlanId);
      } catch (e) {
        if (e instanceof PaymentAmountError) {
          throw new PaymentCorrectionError(
            "That would take the total paid past the agreed price. Adjust the agreed price first.",
          );
        }
        throw e;
      }
    }
    await logActivity(tx, {
      entityType: "payment",
      entityId: payment.id,
      action: "updated",
      performedById: input.actor.id,
      summary: "Payment edited",
      changes: {
        reason,
        fields: changed,
        before: pick(before, changed),
        after: pick(after, changed),
      },
    });
  });

  if (payment.status !== "approved") return { receipt: "none" };
  if (kind === "waiver") return { receipt: payment.kind === "payment" ? "remove" : "none" };
  return { receipt: "regenerate" };
}

function pick<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Partial<T>;
}

export type PaymentStatusTarget = "pending_review" | "rejected" | "voided";

const TRANSITIONS: Record<string, PaymentStatusTarget[]> = {
  approved: ["pending_review", "rejected", "voided"],
  pending_review: ["rejected", "voided"],
  rejected: ["pending_review", "voided"],
  voided: [],
};

const SUMMARIES: Record<PaymentStatusTarget, string> = {
  pending_review: "Payment moved back to review",
  rejected: "Payment rejected",
  voided: "Payment voided",
};

/**
 * Move a payment to another status after the fact: an approved payment back
 * to review or to rejected, a rejected one back to review, or anything to
 * voided (entered by mistake: kept for audit, excluded from all totals).
 * Waivers can only be voided. Conditional on the status read, so a racing
 * approve/reject can't be silently overwritten.
 */
export async function changePaymentStatus(input: {
  paymentId: string;
  actor: PaymentActor;
  to: PaymentStatusTarget;
  reason: string;
}): Promise<{ receipt: ReceiptAction; from: string }> {
  const reason = requireReason(input.reason);
  const payment = await loadForActor(input.paymentId, input.actor);
  const allowed = payment.kind === "waiver" ? ["voided"] : (TRANSITIONS[payment.status] ?? []);
  if (!allowed.includes(input.to)) {
    throw new PaymentCorrectionError(
      payment.status === "voided"
        ? "A voided payment can't be changed"
        : `A ${payment.status === "pending_review" ? "pending" : payment.status} ${
            payment.kind === "waiver" ? "waiver" : "payment"
          } can't be moved to ${input.to === "pending_review" ? "review" : input.to}`,
    );
  }

  const data =
    input.to === "pending_review"
      ? {
          status: "pending_review" as const,
          approvedAt: null,
          approvedById: null,
          rejectionReason: null,
        }
      : input.to === "rejected"
        ? {
            status: "rejected" as const,
            approvedAt: null,
            approvedById: null,
            rejectionReason: reason,
          }
        : { status: "voided" as const, voidReason: reason };

  await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: { ...data, editedAt: new Date(), editedById: input.actor.id },
    });
    if (res.count !== 1) {
      throw new PaymentCorrectionError(
        "This payment changed in the meantime. Reload and try again.",
      );
    }
    await logActivity(tx, {
      entityType: "payment",
      entityId: payment.id,
      action: "status_changed",
      performedById: input.actor.id,
      summary: SUMMARIES[input.to],
      changes: { reason, from: payment.status, to: input.to, amount: payment.amount },
    });
  });

  const hadReceipt = payment.status === "approved" && payment.kind === "payment";
  return { receipt: hadReceipt ? "remove" : "none", from: payment.status };
}
