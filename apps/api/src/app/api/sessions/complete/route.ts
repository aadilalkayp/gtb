import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { completeSession, SessionConflictError } from "@gtb/db/server";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Mark a session completed (SRS §9.3 + §15.4). Beyond the status flip, this
 * auto-creates a pending consultant-fee expense from the consultant's rate and
 * notifies the client to rate the session. Allowed: the session's consultant,
 * ops_head, founder.
 *
 * STATE-3: status flip + payout expense are one transaction (completeSession);
 * STATE-5: actualDate is validated (must parse, must not be in the future).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: { sessionId?: string; notes?: string; actualDate?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.sessionId) return json(req, { error: "sessionId is required" }, 400);

  // STATE-5: actualDate must parse and not be in the future (it back-dates the
  // consultant payout expense too).
  const actualDate = body.actualDate ? new Date(body.actualDate) : new Date();
  if (Number.isNaN(actualDate.getTime())) {
    return json(req, { error: "actualDate is not a valid date" }, 400);
  }
  if (actualDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return json(req, { error: "actualDate cannot be in the future" }, 400);
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

  let result;
  try {
    result = await completeSession({
      sessionId: body.sessionId,
      notes: body.notes,
      actualDate,
    });
  } catch (e) {
    if (e instanceof SessionConflictError) return json(req, { error: e.message }, 409);
    if ((e as Error).message === "NOT_FOUND") return json(req, { error: "Session not found" }, 404);
    throw e;
  }

  if (result.clientUserId) {
    const label = SERVICE_TYPE_LABELS[result.serviceType as ServiceType];
    await notifyUsers([result.clientUserId], {
      type: "session_completed",
      title: "Session complete — rate your experience",
      body: `How was your ${label.toLowerCase()} session?`,
      linkPath: "/portal/sessions",
    });
  }

  return json(req, { ok: true, expenseCreated: result.expenseCreated });
}
