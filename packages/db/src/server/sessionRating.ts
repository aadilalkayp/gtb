import { prisma } from "../index.js";

export interface RateSessionInput {
  sessionId: string;
  rating: number;
  ratingFeedback?: string;
}

export type RateSessionResult =
  | { ok: true; sessionId: string; rating: number }
  | { ok: false; error: string; status: 400 | 403 | 404 | 409 };

/**
 * Client self-service session rating (SRS §13.1, SEC-4).
 *
 * The gateway does NOT expose Session updates to clients (see schema.zmodel
 * notes), so this is the only write path a client has into a Session. It
 * validates server-side: the actor must own the session's client, the session
 * must already be completed, and the rating must be an integer 1-5. The same
 * bounds are backed by the `Session_rating_range` DB CHECK constraint.
 */
export async function applySessionRating(
  actorId: string,
  input: RateSessionInput,
): Promise<RateSessionResult> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "Rating must be a whole number between 1 and 5", status: 400 };
  }

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, status: true, client: { select: { userId: true } } },
  });
  if (!session) return { ok: false, error: "Session not found", status: 404 };
  if (session.client.userId !== actorId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  if (session.status !== "completed") {
    return { ok: false, error: "Only completed sessions can be rated", status: 409 };
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { rating: input.rating, ratingFeedback: input.ratingFeedback?.trim() || null },
  });

  return { ok: true, sessionId: session.id, rating: input.rating };
}
