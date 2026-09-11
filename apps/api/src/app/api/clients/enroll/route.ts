import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { enrollClientInPlan, EnrollmentConflictError } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const STAFF_ENROLLERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Enroll a client in a plan (SRS §6.1 step 5 + §8.2). Creates the ClientPlan
 * (with a price/name snapshot) and the milestone schedule — the plan's
 * evenly-split template by default, or a custom schedule when staff pass
 * `milestones` (amounts must sum to the plan price). STATE-7: creation +
 * leadPhase advance are one transaction, and the double-enroll race returns
 * 409 (EnrollmentConflictError) instead of a 500.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: {
    clientId?: string;
    planId?: string;
    milestones?: { amount?: number; dueDate?: string }[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, planId } = body;
  if (!clientId || !planId) {
    return json(req, { error: "clientId and planId are required" }, 400);
  }

  // Ownership / staff check happens inside enrollClientInPlan for the client
  // path; staff (founder/ops/cro) may enroll anyone.
  const isStaff = STAFF_ENROLLERS.has(authUser.role);
  if (!isStaff) {
    if (body.milestones) {
      return json(req, { error: "Only staff can customise the payment schedule" }, 403);
    }
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, userId: true },
    });
    if (!client) return json(req, { error: "Client not found" }, 404);
    if (client.userId !== authUser.id) return json(req, { error: "Forbidden" }, 403);
  }

  let milestones: { amount: number; dueDate: Date }[] | undefined;
  if (body.milestones) {
    milestones = body.milestones.map((m) => ({
      amount: Number(m.amount),
      dueDate: new Date(m.dueDate ?? NaN),
    }));
  }

  try {
    const clientPlan = await enrollClientInPlan({
      clientId,
      planId,
      actorId: authUser.id,
      milestones,
    });
    return json(req, { clientPlan });
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof EnrollmentConflictError) return json(req, { error: e.message }, 409);
    if (msg === "NOT_FOUND") return json(req, { error: "Client not found" }, 404);
    if (msg === "NOT_LEAD") return json(req, { error: "Client is no longer a lead" }, 409);
    if (msg === "NO_ASSESSMENT") {
      return json(req, { error: "The assessment must be completed before selecting a plan" }, 409);
    }
    if (msg === "PLAN_UNAVAILABLE") return json(req, { error: "Plan not available" }, 404);
    if (msg === "PLAN_MISMATCH") {
      return json(req, { error: "Plan does not match the client's program" }, 409);
    }
    if (msg === "BAD_SCHEDULE") {
      return json(req, { error: "The milestone schedule must sum exactly to the plan price" }, 400);
    }
    throw e;
  }
}

export const POST = withRequestLog(handlePost);
