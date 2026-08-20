import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

export interface RejectPaymentInput {
  installmentId: string;
  reason: string;
  actorId: string;
}

/**
 * Reject a submitted payment proof (SRS §8.3 step 6) — core. MISC-1: the
 * rejected proof link is KEPT (audit trail); the status carries the rejection.
 */
export async function rejectPaymentProof(input: RejectPaymentInput): Promise<void> {
  const installment = await prisma.installment.findUnique({
    where: { id: input.installmentId },
    select: { id: true, status: true, proofDocumentId: true },
  });
  if (!installment) throw new Error("NOT_FOUND");
  if (installment.status !== "proof_submitted") throw new Error("NOT_SUBMITTED");

  await prisma.$transaction(async (tx) => {
    await tx.installment.update({
      where: { id: installment.id },
      data: { status: "rejected", rejectionReason: input.reason.trim() },
    });
    await logActivity(tx, {
      entityType: "installment",
      entityId: installment.id,
      action: "status_changed",
      performedById: input.actorId,
      summary: "Payment proof rejected",
      changes: {
        status: "rejected",
        rejectionReason: input.reason.trim(),
        proofDocumentId: installment.proofDocumentId ?? undefined,
      },
    });
  });
}
