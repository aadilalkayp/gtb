import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { updateMilestoneSchedule } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

// CROs negotiate the deals, so they may record terms too, but only for
// clients they're actively assigned to (same scoping as payments/record).
const EDITORS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Record a client's negotiated price and replace their expected payment
 * schedule. Milestones are pace checkpoints, decoupled from the Payment
 * ledger, so this never touches money. The schedule must sum exactly to the
 * agreed price (sent as `agreedPrice`, or the one already on file); the swap
 * is one transaction and the before/after is audit-logged.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!EDITORS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: {
    clientId?: string;
    agreedPrice?: number;
    milestones?: { amount?: number; dueDate?: string }[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.clientId || !Array.isArray(body.milestones)) {
    return json(req, { error: "clientId and milestones are required" }, 400);
  }

  if (authUser.role === "cro") {
    const assigned = await prisma.assignment.findFirst({
      where: { clientId: body.clientId, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  const milestones = body.milestones.map((m) => ({
    amount: Number(m.amount),
    dueDate: new Date(m.dueDate ?? NaN),
  }));

  try {
    const { count } = await updateMilestoneSchedule({
      clientId: body.clientId,
      agreedPrice: body.agreedPrice == null ? undefined : Number(body.agreedPrice),
      milestones,
      actorId: authUser.id,
    });
    return json(req, { ok: true, count });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NO_PLAN") return json(req, { error: "This client has no plan enrolled" }, 404);
    if (msg === "NO_PRICE") return json(req, { error: "Enter the client's agreed price" }, 400);
    if (msg === "BAD_PRICE") {
      return json(req, { error: "The agreed price must be a positive whole amount" }, 400);
    }
    if (msg === "PRICE_BELOW_PAID") {
      return json(req, { error: "The agreed price can't be less than what's already been paid" }, 400);
    }
    if (msg === "EMPTY") return json(req, { error: "At least one milestone is required" }, 400);
    if (msg === "BAD_AMOUNT") {
      return json(req, { error: "Every milestone needs a positive whole amount" }, 400);
    }
    if (msg === "BAD_DATE") return json(req, { error: "Every milestone needs a valid date" }, 400);
    if (msg === "SUM_MISMATCH") {
      return json(req, { error: "Milestones must sum exactly to the agreed price" }, 400);
    }
    throw e;
  }
}

export const POST = withRequestLog(handlePost);
