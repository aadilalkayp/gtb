import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

/** Thrown when a concurrent approval won the race for this installment. */
export class PaymentConflictError extends Error {
  constructor() {
    super("This installment was already approved or waived");
  }
}

export interface ApproveInstallmentInput {
  installmentId: string;
  paymentMethod: string;
  notes?: string;
  actorId: string;
}

export interface ApproveInstallmentResult {
  converted: boolean;
  client: { id: string; name: string };
}

/**
 * Approve (or manually record) a payment (SRS §8.3/§8.5) — STATE-1 core.
 *
 * All writes happen in one transaction:
 *   1. A CONDITIONAL updateMany — the `status: { notIn: [approved, waived] }`
 *      WHERE is the guard. A concurrent double-approval of the same installment
 *      matches 0 rows and gets PaymentConflictError.
 *   2. The "first approval → convert" decision is derived from a FRESH count
 *      inside the same transaction.
 *   3. The Lead → Converted flip is itself a conditional updateMany on
 *      `status: "lead"`, so two concurrent approvals of two different
 *      installments can never both convert (only one matches), and a crash
 *      mid-flight rolls back installment + conversion together.
 */
export async function approveInstallment(
  input: ApproveInstallmentInput,
): Promise<ApproveInstallmentResult> {
  let converted = false;
  let client: { id: string; name: string } | undefined;

  await prisma.$transaction(async (tx) => {
    // 1. Conditional update — the WHERE is the guard.
    const res = await tx.installment.updateMany({
      where: { id: input.installmentId, status: { notIn: ["approved", "waived"] } },
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
      // Distinguish "doesn't exist" (404) from "already approved/waived" (409) —
      // a bad id shouldn't read as "already approved".
      const exists = await tx.installment.findUnique({
        where: { id: input.installmentId },
        select: { id: true },
      });
      if (!exists) throw new Error("NOT_FOUND");
      throw new PaymentConflictError();
    }

    await logActivity(tx, {
      entityType: "installment",
      entityId: input.installmentId,
      action: "status_changed",
      performedById: input.actorId,
      summary: "Installment approved",
      changes: { status: "approved", paymentMethod: input.paymentMethod },
    });

    // 2. Fresh state + first-approval decision inside the same tx.
    const installment = await tx.installment.findUniqueOrThrow({
      where: { id: input.installmentId },
      select: { clientPlan: { select: { client: { select: { id: true, name: true, status: true } } } } },
    });
    const c = installment.clientPlan.client;
    client = { id: c.id, name: c.name };

    const priorApproved = await tx.installment.count({
      where: {
        clientPlan: { clientId: c.id },
        status: "approved",
        id: { not: input.installmentId },
      },
    });

    // 3. Guarded conversion — only one concurrent approval can flip the client.
    if (priorApproved === 0 && c.status === "lead") {
      const flipped = await tx.client.updateMany({
        where: { id: c.id, status: "lead" },
        data: { status: "converted", conversionDate: new Date(), convertedById: input.actorId },
      });
      converted = flipped.count === 1;
      if (converted) {
        await logActivity(tx, {
          entityType: "client",
          entityId: c.id,
          action: "status_changed",
          performedById: input.actorId,
          summary: "Client converted (first payment approved)",
          changes: { status: "converted" },
        });
      }
    }
  });

  return { converted, client: client ?? { id: "", name: "" } };
}
