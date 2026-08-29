import type { NextRequest } from "next/server";
import { submitPaymentProof, ProofConflictError } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Client submits a payment proof (SRS §8.3 step 7). STATE-6: the installment →
 * proof_submitted write and the client → leadPhase: payment_submitted advance
 * happen in ONE transaction (previously two gateway calls that could desync —
 * see REMEDIATION_PLAN.md STATE-6). Ownership, payability and proof-document
 * validation live in submitPaymentProof.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role !== "client") return json(req, { error: "Forbidden" }, 403);

  let body: { installmentId?: string; proofDocumentId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.installmentId || !body.proofDocumentId) {
    return json(req, { error: "installmentId and proofDocumentId are required" }, 400);
  }

  try {
    await submitPaymentProof({
      installmentId: body.installmentId,
      proofDocumentId: body.proofDocumentId,
      actorId: authUser.id,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof ProofConflictError) return json(req, { error: e.message }, 409);
    if (msg === "NOT_FOUND") return json(req, { error: "Installment not found" }, 404);
    if (msg === "FORBIDDEN") return json(req, { error: "Forbidden" }, 403);
    if (msg === "Invalid proof document") return json(req, { error: msg }, 400);
    throw e;
  }

  return json(req, { ok: true });
}

export const POST = withRequestLog(handlePost);
