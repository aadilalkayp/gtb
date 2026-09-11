import { prisma } from "../index.js";
import {
  generateMilestoneTemplate,
  validateMilestoneSchedule,
  LEAD_PHASE_ORDER,
  type LeadPhase,
} from "@gtb/shared";
import { logActivity } from "./activityLog.js";

/** Thrown when the client already has a plan (the clientId @unique race). */
export class EnrollmentConflictError extends Error {
  constructor() {
    super("This client is already enrolled in a plan");
  }
}

/**
 * Enroll a client in a plan (SRS §6.1 step 5 + §8.2) — STATE-7 core.
 *
 * ClientPlan + milestone schedule + the leadPhase advance are ONE transaction
 * (a crash can't leave the phase stale), and the clientId @unique race
 * surfaces as EnrollmentConflictError (P2002 → 409) instead of a 500.
 *
 * The milestone schedule defaults to the plan's evenly-split template
 * (installmentCount); staff may pass a custom `milestones` schedule, which
 * must sum exactly to the plan price.
 */
export async function enrollClientInPlan(input: {
  clientId: string;
  planId: string;
  actorId?: string | null;
  /** Optional custom schedule (staff only — enforced by the route). */
  milestones?: { amount: number; dueDate: Date }[];
}): Promise<unknown> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    include: {
      clientPlan: { select: { id: true } },
      assessment: { select: { completedAt: true } },
    },
  });
  if (!client) throw new Error("NOT_FOUND");
  if (client.status !== "lead") throw new Error("NOT_LEAD");
  if (client.clientPlan) throw new EnrollmentConflictError();
  // MISC-4: the §5.3 state machine requires a completed assessment before plan
  // selection — a direct API call could otherwise enroll straight past it.
  if (!client.assessment?.completedAt) throw new Error("NO_ASSESSMENT");

  const plan = await prisma.plan.findUnique({
    where: { id: input.planId },
    include: { services: true },
  });
  if (!plan || !plan.isActive) throw new Error("PLAN_UNAVAILABLE");
  if (plan.clientType !== client.type) throw new Error("PLAN_MISMATCH");

  const enrolledAt = new Date();
  let milestones: { milestoneNumber: number; amount: number; dueDate: Date }[];
  if (input.milestones) {
    if (validateMilestoneSchedule(plan.price, input.milestones) !== null) {
      throw new Error("BAD_SCHEDULE");
    }
    milestones = [...input.milestones]
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((m, i) => ({ milestoneNumber: i + 1, amount: m.amount, dueDate: m.dueDate }));
  } else {
    milestones = generateMilestoneTemplate(
      plan.price,
      plan.installmentCount,
      plan.durationMonths,
      enrolledAt,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const cp = await tx.clientPlan.create({
        data: {
          clientId: client.id,
          planId: plan.id,
          planNameSnapshot: plan.name,
          priceAtEnrollment: plan.price,
          durationMonths: plan.durationMonths,
          // SYS-4: snapshot the service rules so later plan edits can't change
          // this client's schedule or assignable roles.
          servicesSnapshot: plan.services.map((s) => ({
            serviceType: s.serviceType,
            totalSessions: s.totalSessions,
            startOffsetDays: s.startOffsetDays,
            frequencyDays: s.frequencyDays,
          })),
          enrolledAt,
          milestones: {
            create: milestones.map((m) => ({
              milestoneNumber: m.milestoneNumber,
              amount: m.amount,
              dueDate: m.dueDate,
            })),
          },
        },
        include: { milestones: { orderBy: { milestoneNumber: "asc" } } },
      });

      await logActivity(tx, {
        entityType: "client",
        entityId: client.id,
        action: "created",
        performedById: input.actorId ?? null,
        summary: `Enrolled in plan "${plan.name}"`,
        changes: { planId: plan.id, price: plan.price },
      });

      if (LEAD_PHASE_ORDER[client.leadPhase as LeadPhase] < LEAD_PHASE_ORDER.plan_selected) {
        await tx.client.update({
          where: { id: client.id },
          data: { leadPhase: "plan_selected" },
        });
      }
      return cp;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new EnrollmentConflictError();
    throw e;
  }
}
