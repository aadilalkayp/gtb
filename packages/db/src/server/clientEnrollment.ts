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
 * Plans carry no price: every fee is negotiated personally. A client enrolling
 * themselves leaves `agreedPrice` null (staff record it later, together with
 * the schedule). Staff enrolling may pass the `agreedPrice` up front, plus an
 * optional custom `milestones` schedule that must sum exactly to it; without
 * one the whole amount is expected on the enrollment date.
 */
export async function enrollClientInPlan(input: {
  clientId: string;
  planId: string;
  actorId?: string | null;
  /** Negotiated fee (staff only, enforced by the route). */
  agreedPrice?: number;
  /** Optional custom schedule (staff only, requires agreedPrice). */
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
  const agreedPrice = input.agreedPrice ?? null;
  if (agreedPrice != null && (!Number.isInteger(agreedPrice) || agreedPrice <= 0)) {
    throw new Error("BAD_PRICE");
  }
  let milestones: { milestoneNumber: number; amount: number; dueDate: Date }[] = [];
  if (input.milestones) {
    if (agreedPrice == null) throw new Error("BAD_SCHEDULE");
    if (validateMilestoneSchedule(agreedPrice, input.milestones) !== null) {
      throw new Error("BAD_SCHEDULE");
    }
    milestones = [...input.milestones]
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((m, i) => ({ milestoneNumber: i + 1, amount: m.amount, dueDate: m.dueDate }));
  } else if (agreedPrice != null) {
    milestones = generateMilestoneTemplate(agreedPrice, 1, plan.durationMonths, enrolledAt);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const cp = await tx.clientPlan.create({
        data: {
          clientId: client.id,
          planId: plan.id,
          planNameSnapshot: plan.name,
          agreedPrice,
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
        changes: { planId: plan.id, agreedPrice },
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

/**
 * Switch a lead to a different plan before any money has moved (the
 * onboarding wizard's "go back and change my plan"). The ClientPlan is
 * updated in place, so rejected payment rows that reference it survive for
 * audit. Blocked once a payment is under review or approved: from then on a
 * plan change is a staff conversation, not a self-serve click. A negotiated
 * price/schedule already on file is kept; staff adjust it if the new plan
 * changes the deal.
 */
export async function changeEnrolledPlan(input: {
  clientId: string;
  planId: string;
  actorId?: string | null;
}): Promise<unknown> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      type: true,
      status: true,
      clientPlan: {
        select: {
          id: true,
          planId: true,
          planNameSnapshot: true,
          payments: { where: { status: { not: "rejected" } }, select: { id: true } },
        },
      },
    },
  });
  if (!client) throw new Error("NOT_FOUND");
  if (client.status !== "lead") throw new Error("NOT_LEAD");
  const current = client.clientPlan;
  if (!current) throw new Error("NO_PLAN");
  if (current.payments.length > 0) throw new Error("PAYMENT_EXISTS");

  const plan = await prisma.plan.findUnique({
    where: { id: input.planId },
    include: { services: true },
  });
  if (!plan || !plan.isActive) throw new Error("PLAN_UNAVAILABLE");
  if (plan.clientType !== client.type) throw new Error("PLAN_MISMATCH");
  if (plan.id === current.planId) return current;

  return prisma.$transaction(async (tx) => {
    // Conditional on "still no live payment" so a submission racing this
    // switch can't end up paying for a plan the client no longer has.
    const updated = await tx.clientPlan.updateMany({
      where: {
        id: current.id,
        payments: { none: { status: { not: "rejected" } } },
        client: { status: "lead" },
      },
      data: {
        planId: plan.id,
        planNameSnapshot: plan.name,
        durationMonths: plan.durationMonths,
        servicesSnapshot: plan.services.map((s) => ({
          serviceType: s.serviceType,
          totalSessions: s.totalSessions,
          startOffsetDays: s.startOffsetDays,
          frequencyDays: s.frequencyDays,
        })),
      },
    });
    if (updated.count !== 1) throw new Error("PAYMENT_EXISTS");

    await logActivity(tx, {
      entityType: "client",
      entityId: client.id,
      action: "updated",
      performedById: input.actorId ?? null,
      summary: `Plan changed from "${current.planNameSnapshot}" to "${plan.name}"`,
      changes: { before: current.planId, after: plan.id },
    });
    return { id: current.id };
  });
}
