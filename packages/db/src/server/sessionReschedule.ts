import { istStartOfDay } from "@gtb/shared";
import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

export interface RescheduleInput {
  sessionId: string;
  newDate: Date;
  actorId: string;
}

/**
 * Reschedule a session (SRS §9.4) — core. DATA-2: the original scheduled date
 * is preserved in `originalScheduledDate` on the first reschedule and the
 * before/after dates are written to the ActivityLog. MISC-3: the session is
 * branded `delayed` only when the new date is LATER (SRS §9.2).
 */
export async function rescheduleSession(input: RescheduleInput): Promise<void> {
  // MISC-3 (second half): a session can only be rescheduled to today or later —
  // "1990-01-01" would otherwise be accepted and notified to the client.
  if (input.newDate.getTime() < istStartOfDay().getTime()) {
    throw new Error("PAST_DATE");
  }

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, scheduledDate: true, originalScheduledDate: true, status: true },
  });
  if (!session) throw new Error("NOT_FOUND");
  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error("LOCKED");
  }

  const movesLater = input.newDate.getTime() > session.scheduledDate.getTime();
  const data: { scheduledDate: Date; status?: "delayed"; originalScheduledDate?: Date } = {
    scheduledDate: input.newDate,
  };
  if (movesLater) data.status = "delayed"; // MISC-3
  if (!session.originalScheduledDate) data.originalScheduledDate = session.scheduledDate; // DATA-2

  await prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: session.id }, data });
    await logActivity(tx, {
      entityType: "session",
      entityId: session.id,
      action: "updated",
      performedById: input.actorId,
      summary: movesLater ? "Session rescheduled (delayed)" : "Session rescheduled (moved earlier)",
      changes: { from: session.scheduledDate, to: input.newDate },
    });
  });
}
