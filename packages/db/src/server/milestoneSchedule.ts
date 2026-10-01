import { prisma } from "../index.js";
import { approvedTotal, validateMilestoneSchedule } from "@gtb/shared";
import { logActivity } from "./activityLog.js";

export interface UpdateMilestoneScheduleInput {
  clientId: string;
  /** The negotiated fee. Omit to keep the one on file (it must exist then). */
  agreedPrice?: number;
  milestones: { amount: number; dueDate: Date }[];
  actorId: string;
}

/**
 * Record a client's agreed price and/or replace their expected payment
 * schedule. Fees are negotiated per client, so this is where the deal lands
 * in the system. The schedule is only a set of checkpoints (payments are a
 * separate ledger), so replacing it never touches money. Invariants: the
 * agreed price can't drop below what's already been settled, and the
 * schedule must sum exactly to it. The whole swap is one transaction and the
 * before/after lands in the activity log.
 */
export async function updateMilestoneSchedule(
  input: UpdateMilestoneScheduleInput,
): Promise<{ count: number }> {
  const plan = await prisma.clientPlan.findUnique({
    where: { clientId: input.clientId },
    select: {
      id: true,
      agreedPrice: true,
      milestones: { orderBy: { milestoneNumber: "asc" }, select: { amount: true, dueDate: true } },
      payments: { select: { amount: true, status: true, kind: true } },
    },
  });
  if (!plan) throw new Error("NO_PLAN");

  const agreedPrice = input.agreedPrice ?? plan.agreedPrice;
  if (agreedPrice == null) throw new Error("NO_PRICE");
  if (!Number.isInteger(agreedPrice) || agreedPrice <= 0) throw new Error("BAD_PRICE");
  if (agreedPrice < approvedTotal(plan.payments)) throw new Error("PRICE_BELOW_PAID");

  const invalid = validateMilestoneSchedule(agreedPrice, input.milestones);
  if (invalid) throw new Error(invalid);

  const ordered = [...input.milestones].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  await prisma.$transaction(async (tx) => {
    if (agreedPrice !== plan.agreedPrice) {
      await tx.clientPlan.update({ where: { id: plan.id }, data: { agreedPrice } });
    }
    await tx.paymentMilestone.deleteMany({ where: { clientPlanId: plan.id } });
    await tx.paymentMilestone.createMany({
      data: ordered.map((m, i) => ({
        clientPlanId: plan.id,
        milestoneNumber: i + 1,
        amount: m.amount,
        dueDate: m.dueDate,
      })),
    });
    await logActivity(tx, {
      entityType: "client",
      entityId: input.clientId,
      action: "updated",
      performedById: input.actorId,
      summary:
        plan.agreedPrice == null
          ? "Agreed price recorded"
          : agreedPrice !== plan.agreedPrice
            ? "Agreed price and payment schedule updated"
            : "Payment schedule updated",
      changes: {
        before: {
          agreedPrice: plan.agreedPrice,
          milestones: plan.milestones.map((m) => ({ amount: m.amount, dueDate: m.dueDate })),
        },
        after: {
          agreedPrice,
          milestones: ordered.map((m) => ({ amount: m.amount, dueDate: m.dueDate })),
        },
      },
    });
  });

  return { count: ordered.length };
}
