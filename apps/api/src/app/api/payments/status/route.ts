import type { NextRequest } from "next/server";
import { changePaymentStatus, type PaymentStatusTarget } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { removeReceiptForPayment } from "@/lib/paymentReceipt";
import { correctionErrorResponse } from "@/lib/paymentCorrectionErrors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const EDITORS = new Set(["founder", "ops_head", "cro"]);
const TARGETS = new Set<PaymentStatusTarget>(["pending_review", "rejected", "voided"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Move a payment to another status after the fact: an approved payment back
 * to review or rejected, a rejected one back to review, or anything voided
 * (kept for audit, excluded from totals). A reason is required; the client's
 * status is never rolled back. Receipts of payments that stop being approved
 * are removed. No client notification: these are internal corrections.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!EDITORS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { paymentId?: string; to?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.paymentId) return json(req, { error: "paymentId is required" }, 400);
  if (!body.to || !TARGETS.has(body.to as PaymentStatusTarget)) {
    return json(req, { error: "to must be pending_review, rejected or voided" }, 400);
  }

  try {
    const { receipt } = await changePaymentStatus({
      paymentId: body.paymentId,
      actor: { id: authUser.id, role: authUser.role },
      to: body.to as PaymentStatusTarget,
      reason: body.reason ?? "",
    });
    if (receipt === "remove") await removeReceiptForPayment(req, body.paymentId);
    return json(req, { ok: true });
  } catch (e) {
    const mapped = correctionErrorResponse(e);
    if (mapped) return json(req, { error: mapped.error }, mapped.status);
    throw e;
  }
}

export const POST = withRequestLog(handlePost);
