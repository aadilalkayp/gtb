import { prisma } from "../index.js";
import { generateServiceSessions, type ServiceType } from "@gtb/shared";
import { logActivity } from "./activityLog.js";

export interface WeddingDateChangeInput {
  clientId: string;
  weddingDate: Date;
  actorId: string;
}

export interface WeddingDateChangeResult {
  sessionsRescheduled: number;
}

type ServiceSnapshot = {
  serviceType: string;
  totalSessions: number;
  startOffsetDays: number;
  frequencyDays: number | null;
};

/**
 * FEAT-5: wedding-date change recalculation (SRS §24.1). One transaction:
 *   - client.weddingDate updated;
 *   - future (scheduled/delayed) sessions regenerated from the enrollment's
 *     service snapshot against the NEW wedding date (completed/cancelled
 *     sessions are untouched — history preserved);
 *   - `originalScheduledDate` is preserved on any session that moves
 *     (DATA-2 consistency);
 *   - ActivityLog written.
 * The route notifies staff (SRS §24.1).
 */
export async function updateWeddingDate(
  input: WeddingDateChangeInput,
): Promise<WeddingDateChangeResult> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      weddingDate: true,
      clientPlan: {
        select: {
          enrolledAt: true,
          servicesSnapshot: true,
          plan: { select: { services: true } },
        },
      },
    },
  });
  if (!client) throw new Error("NOT_FOUND");
  if (!client.clientPlan) throw new Error("NO_PLAN");

  const services = (client.clientPlan.servicesSnapshot as unknown as ServiceSnapshot[] | null) ??
    client.clientPlan.plan.services.map((s) => ({
      serviceType: s.serviceType,
      totalSessions: s.totalSessions,
      startOffsetDays: s.startOffsetDays,
      frequencyDays: s.frequencyDays,
    }));

  // Regenerate the intended schedule per service against the new wedding date.
  const datesByService = new Map<string, Date[]>();
  for (const svc of services) {
    const serviceType = svc.serviceType as ServiceType;
    const sessions = generateServiceSessions(
      {
        serviceType,
        totalSessions: svc.totalSessions,
        startOffsetDays: svc.startOffsetDays,
        frequencyDays: svc.frequencyDays,
      },
      input.weddingDate,
      client.clientPlan.enrolledAt,
    );
    datesByService.set(serviceType, sessions.map((s) => s.scheduledDate));
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: client.id },
      data: { weddingDate: input.weddingDate },
    });

    const futureSessions = await tx.session.findMany({
      where: { clientId: client.id, status: { in: ["scheduled", "delayed"] } },
      select: { id: true, serviceType: true, sessionNumber: true, scheduledDate: true, originalScheduledDate: true },
    });

    let moved = 0;
    for (const s of futureSessions) {
      const dates = datesByService.get(s.serviceType as string);
      const newDate = dates?.[s.sessionNumber - 1];
      if (!newDate) continue;
      if (newDate.getTime() === s.scheduledDate.getTime()) continue;
      await tx.session.update({
        where: { id: s.id },
        data: {
          scheduledDate: newDate,
          // DATA-2: keep the first-scheduled date so history survives.
          ...(s.originalScheduledDate
            ? {}
            : { originalScheduledDate: s.originalScheduledDate ?? s.scheduledDate }),
        },
      });
      moved += 1;
    }

    await logActivity(tx, {
      entityType: "client",
      entityId: client.id,
      action: "updated",
      performedById: input.actorId,
      summary: `Wedding date changed to ${input.weddingDate.toISOString().slice(0, 10)}`,
      changes: { weddingDate: input.weddingDate, sessionsRescheduled: moved },
    });

    return { sessionsRescheduled: moved };
  });

  return result;
}
