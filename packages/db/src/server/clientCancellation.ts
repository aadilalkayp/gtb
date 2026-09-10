import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

export interface CancelClientInput {
  clientId: string;
  reason: string;
  actorId: string;
  waiveOutstanding?: boolean;
}

export interface CancelClientResult {
  sessionsCancelled: number;
  /** Amount written off as a waiver Payment (0 when nothing was outstanding). */
  amountWaived: number;
  loginBlocked: boolean;
}

/**
 * Cancel a client (SRS §24.3) — SYS-3 core. One transaction:
 *   - status → cancelled + cancellationReason;
 *   - all future sessions cancelled;
 *   - the outstanding balance written off as a waiver Payment, and any
 *     still-under-review submissions rejected (staff decision);
 *   - portal login blocked (User.isActive → false);
 *   - ActivityLog rows for each side-effect.
 * Client data is retained (no delete anywhere).
 */
export async function cancelClientPlan(input: CancelClientInput): Promise<CancelClientResult> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, status: true, userId: true },
  });
  if (!client) throw new Error("NOT_FOUND");
  if (client.status === "cancelled") throw new Error("ALREADY_CANCELLED");
  if (client.status === "completed") throw new Error("COMPLETED");

  return prisma.$transaction(async (tx) => {
    // Conditional flip (the WHERE clause is the guard): a concurrent Complete
    // or second Cancel that committed after our read above loses here instead
    // of interleaving into a cancelled-but-completed hybrid.
    const flipped = await tx.client.updateMany({
      where: { id: client.id, status: { notIn: ["cancelled", "completed"] } },
      data: { status: "cancelled", cancellationReason: input.reason.trim() },
    });
    if (flipped.count !== 1) throw new Error("ALREADY_CANCELLED");
    await logActivity(tx, {
      entityType: "client",
      entityId: client.id,
      action: "status_changed",
      performedById: input.actorId,
      summary: "Client cancelled",
      changes: { status: "cancelled", reason: input.reason.trim() },
    });

    const sessions = await tx.session.updateMany({
      where: { clientId: client.id, status: { in: ["scheduled", "delayed"] } },
      data: { status: "cancelled" },
    });

    let waived = 0;
    if (input.waiveOutstanding !== false) {
      const plan = await tx.clientPlan.findUnique({
        where: { clientId: client.id },
        select: {
          id: true,
          priceAtEnrollment: true,
          payments: { select: { amount: true, status: true } },
        },
      });
      if (plan) {
        // A cancelled programme accepts no more money: close the review queue
        // first, then write off whatever balance remains as a waiver entry.
        await tx.payment.updateMany({
          where: { clientPlanId: plan.id, status: "pending_review" },
          data: { status: "rejected", rejectionReason: "Programme cancelled" },
        });
        const approved = plan.payments
          .filter((p) => p.status === "approved")
          .reduce((t, p) => t + p.amount, 0);
        const balance = Math.max(plan.priceAtEnrollment - approved, 0);
        if (balance > 0) {
          await tx.payment.create({
            data: {
              clientPlanId: plan.id,
              amount: balance,
              kind: "waiver",
              status: "approved",
              approvedById: input.actorId,
              approvedAt: new Date(),
              notes: "Outstanding balance waived on cancellation",
            },
          });
          waived = balance;
        }
      }
    }

    let loginBlocked = false;
    if (client.userId) {
      const res = await tx.user.updateMany({
        where: { id: client.userId, isActive: true },
        data: { isActive: false },
      });
      loginBlocked = res.count === 1;
    }

    if (sessions.count > 0) {
      await logActivity(tx, {
        entityType: "client",
        entityId: client.id,
        action: "updated",
        performedById: input.actorId,
        summary: `Cancelled ${sessions.count} future session(s)`,
      });
    }
    if (waived > 0) {
      await logActivity(tx, {
        entityType: "client",
        entityId: client.id,
        action: "updated",
        performedById: input.actorId,
        summary: `Waived outstanding balance (${waived})`,
      });
    }

    return { sessionsCancelled: sessions.count, amountWaived: waived, loginBlocked };
  });
}
