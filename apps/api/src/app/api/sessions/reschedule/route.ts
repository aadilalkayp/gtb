import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { SERVICE_TYPE_LABELS, formatDate, type ServiceType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Reschedule a session (SRS §9.4): set the new date, flip status to `delayed`,
 * and notify the client. Allowed: the session's consultant, ops_head, founder.
 */
export async function POST(req: NextRequest): Promise<Response> {
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
    include: { client: { select: { userId: true } } },
  });
  if (!session) return json(req, { error: "Session not found" }, 404);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  if (!isAdmin && session.consultantId !== authUser.id) {
    return json(req, { error: "Forbidden" }, 403);
  }
  if (session.status === "completed" || session.status === "cancelled") {
    return json(req, { error: "This session can no longer be rescheduled" }, 409);
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { scheduledDate: newDate, status: "delayed" },
  });

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
