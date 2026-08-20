import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

export interface CancelSessionInput {
  sessionId: string;
  /** cancelled = deliberate; missed = the client didn't show (SRS §9.2). */
  outcome: "cancelled" | "missed";
  actorId: string;
}

/**
 * Cancel or mark-missed a session. This replaces the gateway status write the
 * UI used to make (any gateway grant on Session is an every-field grant —
 * ZenStack 2.22 cannot restrict fields on this model), and unlike the gateway
 * path it writes the §23.3 audit row. Guarded: a completed session (which has
 * already spawned its consultant-fee expense) and an already-cancelled one
 * can't be transitioned.
 */
export async function cancelSession(input: CancelSessionInput): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, status: true },
  });
  if (!session) throw new Error("NOT_FOUND");
  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error("LOCKED");
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.session.updateMany({
      where: { id: session.id, status: { notIn: ["completed", "cancelled"] } },
      data: { status: input.outcome },
    });
    if (res.count !== 1) throw new Error("LOCKED");

    await logActivity(tx, {
      entityType: "session",
      entityId: session.id,
      action: "status_changed",
      performedById: input.actorId,
      summary: input.outcome === "cancelled" ? "Session cancelled" : "Session marked missed",
      changes: { from: session.status, to: input.outcome },
    });
  });
}
