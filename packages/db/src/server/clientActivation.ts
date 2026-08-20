import { prisma } from "../index.js";
import {
  generateServiceSessions,
  SERVICE_TO_CONSULTANT_ROLE,
  CONSULTANT_ROLES,
  type ServiceType,
} from "@gtb/shared";
import { logActivity } from "./activityLog.js";

type ServiceSnapshot = {
  serviceType: string;
  totalSessions: number;
  startOffsetDays: number;
  frequencyDays: number | null;
};

export interface ActivateClientResult {
  sessionsCreated: number;
  userId: string | null;
}

/**
 * Activate a converted client (SRS §6.1 steps 12–14, §7.3) — STATE-2 core.
 *
 * Schedule generation, the status flip and follow-up seeding are ONE
 * transaction. `createMany({ skipDuplicates: true })` runs against the
 * @@unique([clientId, serviceType, sessionNumber]) constraint: under two
 * concurrent activations (double-click), whichever inserts first wins each row
 * and the other request's rows are skipped — exactly one schedule is created,
 * and each duplicate session can never spawn its own consultant-fee expense.
 */
export async function activateClientPlan(
  clientId: string,
  actorId?: string,
): Promise<ActivateClientResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      status: true,
      weddingDate: true,
      userId: true,
      clientPlan: {
        select: { enrolledAt: true, servicesSnapshot: true, plan: { select: { services: true } } },
      },
      assignments: { where: { isActive: true }, select: { role: true, staffId: true } },
    },
  });
  if (!client) throw new Error("NOT_FOUND");
  if (!client.clientPlan) throw new Error("NO_PLAN");
  if (client.status !== "converted" && client.status !== "active") {
    throw new Error("NOT_ACTIVATABLE");
  }

  const consultantByRole = new Map<string, string>();
  for (const a of client.assignments) consultantByRole.set(a.role, a.staffId);
  const hasConsultant = CONSULTANT_ROLES.some((r) => consultantByRole.has(r));
  if (!hasConsultant) throw new Error("NO_CONSULTANT");

  const croId = consultantByRole.get("cro");

  // SYS-4: generate from the enrollment's service snapshot (fall back to the
  // live plan for pre-snapshot enrollments) so later plan edits never change
  // an existing client's schedule.
  const services = (client.clientPlan.servicesSnapshot as unknown as ServiceSnapshot[] | null) ??
    client.clientPlan.plan.services.map((s) => ({
      serviceType: s.serviceType,
      totalSessions: s.totalSessions,
      startOffsetDays: s.startOffsetDays,
      frequencyDays: s.frequencyDays,
    }));

  const result = await prisma.$transaction(async (tx) => {
    const rows = services.flatMap((svc) => {
      const serviceType = svc.serviceType as ServiceType;
      const sessions = generateServiceSessions(
        {
          serviceType,
          totalSessions: svc.totalSessions,
          startOffsetDays: svc.startOffsetDays,
          frequencyDays: svc.frequencyDays,
        },
        client.weddingDate,
        client.clientPlan!.enrolledAt,
      );
      const consultantId =
        consultantByRole.get(SERVICE_TO_CONSULTANT_ROLE[serviceType]) ?? null;
      return sessions.map((s) => ({
        clientId: client.id,
        serviceType: s.serviceType,
        consultantId,
        sessionNumber: s.sessionNumber,
        scheduledDate: s.scheduledDate,
      }));
    });

    let sessionsCreated = 0;    if (rows.length > 0) {
      const created = await tx.session.createMany({ data: rows, skipDuplicates: true });
      sessionsCreated = created.count;
    }

    if (client.status !== "active") {
      await tx.client.update({ where: { id: client.id }, data: { status: "active" } });
      await logActivity(tx, {
        entityType: "client",
        entityId: client.id,
        action: "status_changed",
        performedById: actorId,
        summary: "Client activated",
        changes: { status: "active" },
      });
    }

    await logActivity(tx, {
      entityType: "client",
      entityId: client.id,
      action: "updated",
      performedById: actorId,
      summary: `Session schedule generated (${sessionsCreated})`,
    });

    // Seed the CRO's recurring follow-ups (SRS §12.3); completing one
    // auto-creates the next, so only the first of each cadence is needed.
    // The guard counts only the recurring types being seeded — a cron-created
    // payment_reminder existing pre-activation must not suppress the seeds.
    if (croId) {
      const existingFollowUps = await tx.followUp.count({
        where: { clientId: client.id, type: { in: ["weekly_checkin", "progress_update"] } },
      });
      if (existingFollowUps === 0) {
        const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
        await tx.followUp.createMany({
          data: [
            { clientId: client.id, croId, type: "weekly_checkin", dueDate: inDays(7) },
            { clientId: client.id, croId, type: "progress_update", dueDate: inDays(14) },
          ],
        });
      }
    }

    return { sessionsCreated };
  });

  return { sessionsCreated: result.sessionsCreated, userId: client.userId };
}
