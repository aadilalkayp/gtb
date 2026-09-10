import type { Prisma } from "@prisma/client";
import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

/** Thrown when a concurrent approval won the race for this payment. */
export class PaymentConflictError extends Error {
  constructor(message = "This payment was already reviewed") {
    super(message);
  }
}

/** Thrown when a recorded amount would take the plan past fully paid. */
export class PaymentAmountError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface PaymentActionResult {
  paymentId: string;
  converted: boolean;
  client: { id: string; name: string };
}

type Tx = Prisma.TransactionClient;

/**
 * The "first approval → convert" flip, shared by approve and record.
 * Conditional updateMany on `status: "lead"` — two concurrent approvals can
 * never both convert. Waivers never convert (no money arrived).
 */
async function maybeConvert(
  tx: Tx,
  args: { paymentId: string; kind: string; clientPlanId: string; actorId: string },
): Promise<{ converted: boolean; client: { id: string; name: string } }> {
  const plan = await tx.clientPlan.findUniqueOrThrow({
    where: { id: args.clientPlanId },
    select: { client: { select: { id: true, name: true, status: true } } },
  });
  const c = plan.client;
  if (args.kind !== "payment" || c.status !== "lead") {
    return { converted: false, client: { id: c.id, name: c.name } };
  }

  const priorApproved = await tx.payment.count({
    where: {
      clientPlanId: args.clientPlanId,
      status: "approved",
      kind: "payment",
      id: { not: args.paymentId },
    },
  });
  if (priorApproved > 0) return { converted: false, client: { id: c.id, name: c.name } };

  const flipped = await tx.client.updateMany({
    where: { id: c.id, status: "lead" },
    data: { status: "converted", conversionDate: new Date(), convertedById: args.actorId },
  });
  const converted = flipped.count === 1;
  if (converted) {
    await logActivity(tx, {
      entityType: "client",
      entityId: c.id,
      action: "status_changed",
      performedById: args.actorId,
      summary: "Client converted (first payment approved)",
      changes: { status: "converted" },
    });
  }
  return { converted, client: { id: c.id, name: c.name } };
}

/** Roll back if approved rows now exceed the enrolled price — the balance
 *  guard against two concurrent approvals/records overpaying a plan. */
async function assertNotOverpaid(tx: Tx, clientPlanId: string): Promise<void> {
  const plan = await tx.clientPlan.findUniqueOrThrow({
    where: { id: clientPlanId },
    select: { priceAtEnrollment: true },
  });
  const sum = await tx.payment.aggregate({
    where: { clientPlanId, status: "approved" },
    _sum: { amount: true },
  });
  if ((sum._sum.amount ?? 0) > plan.priceAtEnrollment) {
    throw new PaymentAmountError("This amount would exceed the remaining balance");
  }
}

/**
 * Approve a client-submitted payment (SRS §8.3/§8.5) — STATE-1 core.
 *
 * All writes happen in one transaction:
 *   1. A CONDITIONAL updateMany — `status: "pending_review"` in the WHERE is
 *      the guard: a concurrent double-approval matches 0 rows and gets
 *      PaymentConflictError.
 *   2. A balance re-check inside the same tx rolls back an approval that
 *      would overpay the plan (e.g. racing with a manual record).
 *   3. The Lead → Converted flip is itself conditional (see maybeConvert), so
 *      a crash can never leave an approved-but-never-converted client.
 */
export async function approvePayment(input: {
  paymentId: string;
  paymentMethod: string;
  notes?: string;
  actorId: string;
}): Promise<PaymentActionResult> {
  let converted = false;
  let client: { id: string; name: string } | undefined;

  await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id: input.paymentId, status: "pending_review" },
      data: {
        status: "approved",
        paymentMethod: input.paymentMethod as never,
        approvedById: input.actorId,
        approvedAt: new Date(),
        rejectionReason: null,
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });
    if (res.count !== 1) {
      // Distinguish "doesn't exist" (404) from "already reviewed" (409) — a
      // bad id shouldn't read as "already approved".
      const exists = await tx.payment.findUnique({
        where: { id: input.paymentId },
        select: { id: true },
      });
      if (!exists) throw new Error("NOT_FOUND");
      throw new PaymentConflictError();
    }

    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
      select: { clientPlanId: true, kind: true, amount: true },
    });
    await assertNotOverpaid(tx, payment.clientPlanId);

    await logActivity(tx, {
      entityType: "payment",
      entityId: input.paymentId,
      action: "status_changed",
      performedById: input.actorId,
      summary: "Payment approved",
      changes: { status: "approved", amount: payment.amount, paymentMethod: input.paymentMethod },
    });

    const conv = await maybeConvert(tx, {
      paymentId: input.paymentId,
      kind: payment.kind,
      clientPlanId: payment.clientPlanId,
      actorId: input.actorId,
    });
    converted = conv.converted;
    client = conv.client;
  });

  return { paymentId: input.paymentId, converted, client: client ?? { id: "", name: "" } };
}

/**
 * Staff records money (or a waiver) directly — creates an already-approved
 * Payment in one transaction, with the same balance guard and conversion
 * semantics as approvePayment. Replaces the old "approve a pending
 * installment to record cash" flow.
 */
export async function recordPayment(input: {
  clientId: string;
  amount: number;
  paymentMethod?: string;
  kind?: "payment" | "waiver";
  notes?: string;
  actorId: string;
}): Promise<PaymentActionResult> {
  const kind = input.kind ?? "payment";
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new PaymentAmountError("Amount must be a positive whole amount");
  }

  const plan = await prisma.clientPlan.findUnique({
    where: { clientId: input.clientId },
    select: { id: true },
  });
  if (!plan) throw new Error("NO_PLAN");

  let converted = false;
  let client: { id: string; name: string } | undefined;
  let paymentId = "";

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        clientPlanId: plan.id,
        amount: input.amount,
        kind: kind as never,
        status: "approved",
        paymentMethod: (kind === "payment" ? input.paymentMethod : null) as never,
        approvedById: input.actorId,
        approvedAt: new Date(),
        ...(input.notes ? { notes: input.notes } : {}),
      },
      select: { id: true },
    });
    paymentId = payment.id;
    await assertNotOverpaid(tx, plan.id);

    await logActivity(tx, {
      entityType: "payment",
      entityId: payment.id,
      action: "created",
      performedById: input.actorId,
      summary: kind === "waiver" ? "Amount waived" : "Payment recorded",
      changes: { amount: input.amount, kind, paymentMethod: input.paymentMethod },
    });

    const conv = await maybeConvert(tx, {
      paymentId: payment.id,
      kind,
      clientPlanId: plan.id,
      actorId: input.actorId,
    });
    converted = conv.converted;
    client = conv.client;
  });

  return { paymentId, converted, client: client ?? { id: "", name: "" } };
}
