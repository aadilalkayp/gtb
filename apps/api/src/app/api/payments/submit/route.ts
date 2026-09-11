import type { NextRequest } from "next/server";
import { submitPayment, ProofConflictError } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Client submits a payment of any amount with a proof (SRS §8.3 step 7,
 * flexible-payments rework). STATE-6: the pending_review Payment and the
 * client → leadPhase: payment_submitted advance happen in ONE transaction.
 * Amount/balance validation and proof-document ownership live in
 * submitPayment.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role !== "client") return json(req, { error: "Forbidden" }, 403);

  let body: { amount?: number; proofDocumentId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (typeof body.amount !== "number" || !body.proofDocumentId) {
    return json(req, { error: "amount and proofDocumentId are required" }, 400);
  }

  try {
    const { paymentId } = await submitPayment({
      actorId: authUser.id,
      amount: body.amount,
      proofDocumentId: body.proofDocumentId,
    });
    return json(req, { ok: true, paymentId });
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof ProofConflictError) return json(req, { error: e.message }, 409);
    if (msg === "NO_PLAN") return json(req, { error: "No plan enrolled yet" }, 404);
    if (msg === "BAD_AMOUNT") {
      return json(req, { error: "Amount must be a positive whole amount" }, 400);
    }
    if (msg === "AMOUNT_TOO_HIGH") {
      return json(req, { error: "Amount is more than your remaining balance" }, 400);
    }
    if (msg === "Invalid proof document") return json(req, { error: msg }, 400);
    throw e;
  }
}

export const POST = withRequestLog(handlePost);
