import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { istStartOfDay } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * "Send Reminder" on the fitness pages: nudges the client about their open
 * workout. Notification rows are server-created only, hence the route.
 * Allowed: founder/ops_head or staff actively assigned to the client.
 * Rate-limited to one per client per IST day (same dedupe rule as the cron
 * nudge) so a keen trainer can't spam the client's feed.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role === "client") return json(req, { error: "Forbidden" }, 403);

  let body: { planId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.planId) return json(req, { error: "planId is required" }, 400);

  const plan = await prisma.fitnessPlan.findUnique({
    where: { id: body.planId },
    select: {
      id: true,
      status: true,
      client: { select: { id: true, userId: true, name: true } },
    },
  });
  if (!plan) return json(req, { error: "Plan not found" }, 404);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  if (!isAdmin) {
    const assignment = await prisma.assignment.findFirst({
      where: { clientId: plan.client.id, staffId: authUser.id, isActive: true },
      select: { id: true },
    });
    if (!assignment) return json(req, { error: "Forbidden" }, 403);
  }
  if (!plan.client.userId) {
    return json(req, { error: "Client has no portal account yet" }, 409);
  }

  const already = await prisma.notification.findFirst({
    where: {
      userId: plan.client.userId,
      type: "fitness_reminder",
      createdAt: { gte: istStartOfDay(new Date()) },
    },
    select: { id: true },
  });
  if (already) return json(req, { ok: true, sent: false, reason: "already_sent_today" });

  await notifyUsers([plan.client.userId], {
    type: "fitness_reminder",
    title: "A nudge from your trainer",
    body: "Your workout for today is waiting. A quick session now keeps your streak alive.",
    linkPath: "/portal/fitness",
  });

  return json(req, { ok: true, sent: true });
}

export const POST = withRequestLog(handlePost);
