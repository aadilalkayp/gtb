import type { NextRequest } from "next/server";
import { updateMilestoneSchedule } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

// Money terms are admin-only — a CRO renegotiating a schedule goes through
// founder/ops (mirrors the ClientPlan gateway policy).
const EDITORS = new Set(["founder", "ops_head"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Replace a client's expected payment schedule (flexible-payments rework).
 * Milestones are pace checkpoints, decoupled from the Payment ledger, so this
 * never touches money. The schedule must sum exactly to priceAtEnrollment;
 * the swap is one transaction and the before/after is audit-logged.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!EDITORS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { clientId?: string; milestones?: { amount?: number; dueDate?: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.clientId || !Array.isArray(body.milestones)) {
    return json(req, { error: "clientId and milestones are required" }, 400);
  }

  const milestones = body.milestones.map((m) => ({
    amount: Number(m.amount),
    dueDate: new Date(m.dueDate ?? NaN),
  }));

  try {
    const { count } = await updateMilestoneSchedule({
      clientId: body.clientId,
      milestones,
      actorId: authUser.id,
    });
    return json(req, { ok: true, count });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NO_PLAN") return json(req, { error: "This client has no plan enrolled" }, 404);
    if (msg === "EMPTY") return json(req, { error: "At least one milestone is required" }, 400);
    if (msg === "BAD_AMOUNT") {
      return json(req, { error: "Every milestone needs a positive whole amount" }, 400);
    }
    if (msg === "BAD_DATE") return json(req, { error: "Every milestone needs a valid date" }, 400);
    if (msg === "SUM_MISMATCH") {
      return json(req, { error: "Milestones must sum exactly to the enrolled plan price" }, 400);
    }
    throw e;
  }
}

export const POST = withRequestLog(handlePost);
