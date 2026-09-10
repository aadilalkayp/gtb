import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { logActivity } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const COMPLETERS = new Set(["founder", "ops_head"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Complete a client (SRS §5.2 — SYS-3). Server-side preconditions (SRS §5.2):
 * all sessions must be completed or cancelled, the plan balance must be zero
 * (paid or waived), and nothing may still be under review.
 * Only founder/ops may complete.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!COMPLETERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { clientId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.clientId) return json(req, { error: "clientId is required" }, 400);

  const client = await prisma.client.findUnique({
    where: { id: body.clientId },
    select: { id: true, status: true },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);
  if (client.status === "completed") return json(req, { error: "Client is already completed" }, 409);
  if (client.status === "cancelled") return json(req, { error: "A cancelled client can't be completed" }, 409);

  // Preconditions + flip live in ONE transaction, and the flip is conditional —
  // otherwise a concurrent Cancel (or a session created between the check and
  // the write) interleaves into a completed client with open sessions.
  try {
    await prisma.$transaction(async (tx) => {
      const [openSessions, plan, underReview] = await Promise.all([
        tx.session.count({
          where: { clientId: client.id, status: { in: ["scheduled", "delayed", "missed"] } },
        }),
        tx.clientPlan.findUnique({
          where: { clientId: client.id },
          select: {
            priceAtEnrollment: true,
            payments: { where: { status: "approved" }, select: { amount: true } },
          },
        }),
        tx.payment.count({
          where: { clientPlan: { clientId: client.id }, status: "pending_review" },
        }),
      ]);
      if (openSessions > 0) throw new PreconditionError(`All sessions must be completed or cancelled first (${openSessions} still open)`);
      const approved = plan?.payments.reduce((t, p) => t + p.amount, 0) ?? 0;
      const balance = plan ? Math.max(plan.priceAtEnrollment - approved, 0) : 0;
      if (balance > 0) throw new PreconditionError(`The outstanding balance must be settled or waived first (${balance} remaining)`);
      if (underReview > 0) throw new PreconditionError(`Submitted payments must be reviewed first (${underReview} awaiting review)`);

      const flipped = await tx.client.updateMany({
        where: { id: client.id, status: { notIn: ["completed", "cancelled"] } },
        data: { status: "completed" },
      });
      if (flipped.count !== 1) throw new PreconditionError("Client is already completed or cancelled");

      await logActivity(tx, {
        entityType: "client",
        entityId: client.id,
        action: "status_changed",
        performedById: authUser.id,
        summary: "Client completed",
        changes: { status: "completed" },
      });
    });
  } catch (e) {
    if (e instanceof PreconditionError) return json(req, { error: e.message }, 409);
    throw e;
  }

  return json(req, { ok: true });
}

class PreconditionError extends Error {}

export const POST = withRequestLog(handlePost);
