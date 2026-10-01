import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { changeEnrolledPlan } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const STAFF_ENROLLERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Switch a lead's enrolled plan before any payment is live (the onboarding
 * wizard's "go back and pick another plan"). Clients may switch their own
 * plan; founder/ops/cro may switch anyone's. Once a payment is under review
 * or approved the switch is refused (409).
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: { clientId?: string; planId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, planId } = body;
  if (!clientId || !planId) {
    return json(req, { error: "clientId and planId are required" }, 400);
  }

  if (!STAFF_ENROLLERS.has(authUser.role)) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { userId: true },
    });
    if (!client) return json(req, { error: "Client not found" }, 404);
    if (client.userId !== authUser.id) return json(req, { error: "Forbidden" }, 403);
  }

  try {
    const clientPlan = await changeEnrolledPlan({ clientId, planId, actorId: authUser.id });
    return json(req, { clientPlan });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Client not found" }, 404);
    if (msg === "NOT_LEAD") return json(req, { error: "Client is no longer a lead" }, 409);
    if (msg === "NO_PLAN") return json(req, { error: "No plan has been chosen yet" }, 409);
    if (msg === "PAYMENT_EXISTS") {
      return json(
        req,
        { error: "A payment is already in for this plan. Ask your coordinator to change it." },
        409,
      );
    }
    if (msg === "PLAN_UNAVAILABLE") return json(req, { error: "Plan not available" }, 404);
    if (msg === "PLAN_MISMATCH") {
      return json(req, { error: "Plan does not match the client's program" }, 409);
    }
    throw e;
  }
}

export const POST = withRequestLog(handlePost);
