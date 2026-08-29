import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { updateWeddingDate } from "@gtb/db/server";
import { formatDate } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers, getAdminUserIds } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * FEAT-5: change a client's wedding date and recalculate their future session
 * schedule (SRS §24.1) — one transaction, completed/cancelled sessions
 * untouched, ActivityLog written, staff notified.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role !== "founder" && authUser.role !== "ops_head") {
    return json(req, { error: "Forbidden" }, 403);
  }

  let body: { clientId?: string; weddingDate?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.clientId || !body.weddingDate) {
    return json(req, { error: "clientId and weddingDate are required" }, 400);
  }
  const weddingDate = new Date(body.weddingDate);
  if (Number.isNaN(weddingDate.getTime())) {
    return json(req, { error: "weddingDate is not a valid date" }, 400);
  }
  if (weddingDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return json(req, { error: "Wedding date cannot be in the past" }, 400);
  }

  const client = await prisma.client.findUnique({
    where: { id: body.clientId },
    select: { id: true, name: true, userId: true },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);

  let result;
  try {
    result = await updateWeddingDate({
      clientId: client.id,
      weddingDate,
      actorId: authUser.id,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Client not found" }, 404);
    if (msg === "NO_PLAN") {
      return json(req, { error: "This client has no plan to reschedule" }, 409);
    }
    throw e;
  }

  // SRS §24.1: staff are notified that sessions were rescheduled.
  const admins = await getAdminUserIds();
  await notifyUsers(
    admins.filter((id) => id !== authUser.id),
    {
      type: "wedding_date_changed",
      title: "Wedding date changed",
      body: `${client.name}'s wedding is now ${formatDate(weddingDate)} — ${result.sessionsRescheduled} future session(s) were rescheduled.`,
      linkPath: `/clients/${client.id}`,
    },
  );

  return json(req, { ok: true, ...result });
}

export const POST = withRequestLog(handlePost);
