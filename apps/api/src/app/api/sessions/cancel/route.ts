import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { cancelSession } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Cancel a session or mark it missed. Allowed: the session's consultant,
 * ops_head, founder. Consultants lost their gateway Session write path (it was
 * an every-field grant — see schema notes), so this route is their only
 * cancel/miss path; unlike the old gateway write it records the audit row.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: { sessionId?: string; outcome?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.sessionId) return json(req, { error: "sessionId is required" }, 400);
  if (body.outcome !== "cancelled" && body.outcome !== "missed") {
    return json(req, { error: "outcome must be 'cancelled' or 'missed'" }, 400);
  }

  const session = await prisma.session.findUnique({
    where: { id: body.sessionId },
    select: { id: true, consultantId: true },
  });
  if (!session) return json(req, { error: "Session not found" }, 404);
  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  if (!isAdmin && session.consultantId !== authUser.id) {
    return json(req, { error: "Forbidden" }, 403);
  }

  try {
    await cancelSession({
      sessionId: body.sessionId,
      outcome: body.outcome,
      actorId: authUser.id,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Session not found" }, 404);
    if (msg === "LOCKED") {
      return json(req, { error: "This session is already completed or cancelled" }, 409);
    }
    throw e;
  }

  return json(req, { ok: true });
}
