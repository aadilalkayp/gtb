import { prisma } from "../index.js";
import { LEAD_PHASE_ORDER, type LeadPhase } from "@gtb/shared";
import { logActivity } from "./activityLog.js";

/** Thrown when a concurrent submit won the race (or the installment is no longer payable). */
export class ProofConflictError extends Error {
  constructor() {
    super("This installment can no longer accept a proof");
  }
}

export interface SubmitProofInput {
  installmentId: string;
  proofDocumentId: string;
  actorId: string;
}

/**
 * Client submits a payment proof (SRS §8.3 step 7) — STATE-6 core.
 *
 * The installment → proof_submitted write and the client → leadPhase:
 * payment_submitted advance happen in ONE transaction (previously two gateway
 * calls that could desync). The conditional updateMany (`status IN payable`)
 * is the guard against double-submit; the proof document must belong to the
 * submitting client.
 */
export async function submitPaymentProof(input: SubmitProofInput): Promise<void> {
  const installment = await prisma.installment.findUnique({
    where: { id: input.installmentId },
    select: {
      id: true,
      status: true,
      clientPlan: { select: { client: { select: { id: true, userId: true, leadPhase: true } } } },
    },
  });
  if (!installment) throw new Error("NOT_FOUND");
  const client = installment.clientPlan.client;
  if (client.userId !== input.actorId) throw new Error("FORBIDDEN");
  if (!["pending", "overdue", "rejected"].includes(installment.status)) {
    throw new ProofConflictError();
  }

  const proof = await prisma.document.findUnique({
    where: { id: input.proofDocumentId },
    select: { clientId: true },
  });
  if (!proof || proof.clientId !== client.id) throw new Error("Invalid proof document");

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.installment.updateMany({
        where: { id: installment.id, status: { in: ["pending", "overdue", "rejected"] } },
        data: { status: "proof_submitted", proofDocumentId: input.proofDocumentId },
      });
      if (updated.count !== 1) throw new ProofConflictError();

      await logActivity(tx, {
        entityType: "installment",
        entityId: installment.id,
        action: "status_changed",
        performedById: input.actorId,
        summary: "Payment proof submitted",
        changes: { status: "proof_submitted", proofDocumentId: input.proofDocumentId },
      });

      if (LEAD_PHASE_ORDER[client.leadPhase as LeadPhase] < LEAD_PHASE_ORDER.payment_submitted) {
        await tx.client.update({
          where: { id: client.id },
          data: { leadPhase: "payment_submitted" },
        });
      }
    });
  } catch (e) {
    // proofDocumentId is globally @unique: re-submitting a document that is
    // already linked to another installment (e.g. one rejected earlier, where
    // the link is intentionally kept for audit — MISC-1) is a conflict the
    // client can act on, not a 500.
    if (isUniqueViolation(e)) throw new ProofConflictError();
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
