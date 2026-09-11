import { prisma } from "../index.js";
import { validateMilestoneSchedule } from "@gtb/shared";
import { logActivity } from "./activityLog.js";

export interface UpdateMilestoneScheduleInput {
  clientId: string;
  milestones: { amount: number; dueDate: Date }[];
  actorId: string;
}

/**
 * Replace a client's expected payment schedule (the flexible-payments rework's
 * renegotiation path). The schedule is only a set of checkpoints — payments
 * are a separate ledger — so replacing it never touches money. Invariant: the
 * new schedule must sum exactly to priceAtEnrollment. The whole swap is one
 * transaction and the before/after lands in the activity log.
 */
export async function updateMilestoneSchedule(
  input: UpdateMilestoneScheduleInput,
): Promise<{ count: number }> {
  const plan = await prisma.clientPlan.findUnique({
    where: { clientId: input.clientId },
    select: {
      id: true,
      priceAtEnrollment: true,
      milestones: { orderBy: { milestoneNumber: "asc" }, select: { amount: true, dueDate: true } },
    },
  });
  if (!plan) throw new Error("NO_PLAN");

  const invalid = validateMilestoneSchedule(plan.priceAtEnrollment, input.milestones);
  if (invalid) throw new Error(invalid);

  const ordered = [...input.milestones].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  await prisma.$transaction(async (tx) => {
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
      summary: "Payment schedule updated",
      changes: {
        before: plan.milestones.map((m) => ({ amount: m.amount, dueDate: m.dueDate })),
        after: ordered.map((m) => ({ amount: m.amount, dueDate: m.dueDate })),
      },
    });
  });

  return { count: ordered.length };
}
