import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

export interface RejectPaymentInput {
  paymentId: string;
  reason: string;
  actorId: string;
}

/**
 * Reject a submitted payment (SRS §8.3 step 6). MISC-1: the rejected proof
 * link is KEPT (audit trail); the client simply submits a fresh payment.
 * Conditional update — only a pending_review payment can be rejected, so a
 * concurrent approve wins cleanly.
 */
export async function rejectPayment(input: RejectPaymentInput): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true, proofDocumentId: true },
  });
  if (!payment) throw new Error("NOT_FOUND");
  if (payment.status !== "pending_review") throw new Error("NOT_SUBMITTED");

  await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id: payment.id, status: "pending_review" },
      data: { status: "rejected", rejectionReason: input.reason.trim() },
    });
    if (res.count !== 1) throw new Error("NOT_SUBMITTED");
    await logActivity(tx, {
      entityType: "payment",
      entityId: payment.id,
      action: "status_changed",
      performedById: input.actorId,
      summary: "Payment proof rejected",
      changes: {
        status: "rejected",
        rejectionReason: input.reason.trim(),
        proofDocumentId: payment.proofDocumentId ?? undefined,
      },
    });
  });
}
