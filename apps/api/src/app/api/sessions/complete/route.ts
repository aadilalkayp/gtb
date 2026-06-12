import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Expense category auto-payout entries are filed under (seeded). */
const CONSULTANT_FEE_CATEGORY = "Consultant Fee";

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Mark a session completed (SRS §9.3 + §15.4). Beyond the status flip, this:
 *   - auto-creates a pending consultant-fee expense from the consultant's rate,
 *   - notifies the client to rate the session.
 * Allowed: the session's consultant, ops_head, founder.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: { sessionId?: string; notes?: string; actualDate?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.sessionId) return json(req, { error: "sessionId is required" }, 400);

  const session = await prisma.session.findUnique({
    where: { id: body.sessionId },
    include: { client: { select: { id: true, name: true, userId: true } } },
  });
  if (!session) return json(req, { error: "Session not found" }, 404);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  if (!isAdmin && session.consultantId !== authUser.id) {
    return json(req, { error: "Forbidden" }, 403);
  }
  if (session.status === "completed") {
    return json(req, { error: "Session is already completed" }, 409);
  }
  if (session.status === "cancelled") {
    return json(req, { error: "A cancelled session can't be completed" }, 409);
  }

  const actualDate = body.actualDate ? new Date(body.actualDate) : new Date();

  await prisma.session.update({
    where: { id: session.id },
    data: {
      status: "completed",
      actualDate,
      ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
    },
  });

  // Auto-create the consultant payout expense (best-effort — skipped without a rate).
  let expenseCreated = false;
  if (session.consultantId) {
    const rate = await prisma.consultantRate.findUnique({
      where: {
        userId_serviceType: {
          userId: session.consultantId,
          serviceType: session.serviceType,
        },
      },
    });
    const category = rate
      ? await prisma.expenseCategory.findUnique({ where: { name: CONSULTANT_FEE_CATEGORY } })
      : null;
    if (rate && category) {
      const serviceLabel = SERVICE_TYPE_LABELS[session.serviceType as ServiceType];
      await prisma.expense.create({
        data: {
          categoryId: category.id,
          title: `${serviceLabel} session ${session.sessionNumber} — ${session.client.name}`,
          amount: rate.amount,
          date: actualDate,
          submittedById: session.consultantId,
          payeeId: session.consultantId,
          clientId: session.client.id,
          sessionId: session.id,
        },
      });
      expenseCreated = true;
    }
  }

  if (session.client.userId) {
    await notifyUsers([session.client.userId], {
      type: "session_completed",
      title: "Session complete — rate your experience",
      body: `How was your ${SERVICE_TYPE_LABELS[session.serviceType as ServiceType].toLowerCase()} session?`,
      linkPath: "/portal/sessions",
    });
  }

  return json(req, { ok: true, expenseCreated });
}
