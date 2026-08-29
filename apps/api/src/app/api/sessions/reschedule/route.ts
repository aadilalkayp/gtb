import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { rescheduleSession } from "@gtb/db/server";
import { SERVICE_TYPE_LABELS, formatDate, type ServiceType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Reschedule a session (SRS §9.4). DATA-2 (original date preserved + audit
 * log) and MISC-3 (delayed only when moved later) live in rescheduleSession.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: { sessionId?: string; newDate?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.sessionId || !body.newDate) {
    return json(req, { error: "sessionId and newDate are required" }, 400);
  }
  const newDate = new Date(body.newDate);
  if (Number.isNaN(newDate.getTime())) {
    return json(req, { error: "newDate is not a valid date" }, 400);
  }

  const session = await prisma.session.findUnique({
    where: { id: body.sessionId },
    select: { id: true, serviceType: true, sessionNumber: true, consultantId: true, client: { select: { userId: true } } },
  });
  if (!session) return json(req, { error: "Session not found" }, 404);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  if (!isAdmin && session.consultantId !== authUser.id) {
    return json(req, { error: "Forbidden" }, 403);
  }

  try {
    await rescheduleSession({ sessionId: body.sessionId, newDate, actorId: authUser.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Session not found" }, 404);
    if (msg === "LOCKED") {
      return json(req, { error: "This session can no longer be rescheduled" }, 409);
    }
    if (msg === "PAST_DATE") {
      return json(req, { error: "The new date cannot be in the past" }, 400);
    }
    throw e;
  }

  if (session.client.userId) {
    const label = SERVICE_TYPE_LABELS[session.serviceType as ServiceType];
    await notifyUsers([session.client.userId], {
      type: "session_rescheduled",
      title: `${label} session rescheduled`,
      body: `Your session ${session.sessionNumber} is now on ${formatDate(newDate)}.`,
      linkPath: "/portal/sessions",
    });
  }

  return json(req, { ok: true });
}

export const POST = withRequestLog(handlePost);
