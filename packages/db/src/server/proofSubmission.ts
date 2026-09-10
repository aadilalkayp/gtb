import { prisma } from "../index.js";
import { LEAD_PHASE_ORDER, type LeadPhase } from "@gtb/shared";
import { logActivity } from "./activityLog.js";

/** Thrown when the submission can't be accepted (proof re-use, no balance…). */
export class ProofConflictError extends Error {
  constructor(message = "This payment can no longer be submitted") {
    super(message);
  }
}

export interface SubmitPaymentInput {
  /** Portal user submitting (must be the client's own user). */
  actorId: string;
  amount: number;
  proofDocumentId: string;
}

/**
 * Client submits a payment of any amount with a proof (SRS §8.3 step 7) —
 * STATE-6 core. Creates a pending_review Payment and advances the client to
 * leadPhase: payment_submitted in ONE transaction. The proof document must
 * belong to the submitting client, and the amount may not exceed what's left
 * of the balance once other still-under-review submissions are counted.
 */
export async function submitPayment(input: SubmitPaymentInput): Promise<{ paymentId: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("BAD_AMOUNT");
  }

  const client = await prisma.client.findFirst({
    where: { userId: input.actorId },
    select: {
      id: true,
      leadPhase: true,
      clientPlan: {
        select: {
          id: true,
          priceAtEnrollment: true,
          payments: { select: { amount: true, status: true } },
        },
      },
    },
  });
  if (!client || !client.clientPlan) throw new Error("NO_PLAN");
  const plan = client.clientPlan;

  const approved = plan.payments
    .filter((p) => p.status === "approved")
    .reduce((t, p) => t + p.amount, 0);
  const underReview = plan.payments
    .filter((p) => p.status === "pending_review")
    .reduce((t, p) => t + p.amount, 0);
  const submittable = Math.max(plan.priceAtEnrollment - approved - underReview, 0);
  if (submittable === 0) throw new ProofConflictError("There is nothing left to pay");
  if (input.amount > submittable) throw new Error("AMOUNT_TOO_HIGH");

  const proof = await prisma.document.findUnique({
    where: { id: input.proofDocumentId },
    select: { clientId: true },
  });
  if (!proof || proof.clientId !== client.id) throw new Error("Invalid proof document");

  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          clientPlanId: plan.id,
          amount: input.amount,
          status: "pending_review",
          proofDocumentId: input.proofDocumentId,
          submittedById: input.actorId,
        },
        select: { id: true },
      });

      await logActivity(tx, {
        entityType: "payment",
        entityId: payment.id,
        action: "created",
        performedById: input.actorId,
        summary: "Payment proof submitted",
        changes: { amount: input.amount, proofDocumentId: input.proofDocumentId },
      });

      if (LEAD_PHASE_ORDER[client.leadPhase as LeadPhase] < LEAD_PHASE_ORDER.payment_submitted) {
        await tx.client.update({
          where: { id: client.id },
          data: { leadPhase: "payment_submitted" },
        });
      }
      return { paymentId: payment.id };
    });
  } catch (e) {
    // proofDocumentId is globally @unique: re-submitting a document that is
    // already attached to another payment (e.g. one rejected earlier, where
    // the link is intentionally kept for audit — MISC-1) is a conflict the
    // client can act on, not a 500.
    if (isUniqueViolation(e)) {
      throw new ProofConflictError("This proof was already submitted — upload a fresh one");
    }
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
