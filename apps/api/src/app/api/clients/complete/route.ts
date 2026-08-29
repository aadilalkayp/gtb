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
 * all sessions must be completed or cancelled, and no mandatory outstanding
 * payments may remain (pending/overdue/proof_submitted count must be 0).
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
      const [openSessions, outstanding] = await Promise.all([
        tx.session.count({
          where: { clientId: client.id, status: { in: ["scheduled", "delayed", "missed"] } },
        }),
        tx.installment.count({
          where: {
            clientPlan: { clientId: client.id },
            status: { in: ["pending", "overdue", "proof_submitted", "rejected"] },
          },
        }),
      ]);
      if (openSessions > 0) throw new PreconditionError(`All sessions must be completed or cancelled first (${openSessions} still open)`);
      if (outstanding > 0) throw new PreconditionError(`Outstanding payments must be settled or waived first (${outstanding} remaining)`);

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
