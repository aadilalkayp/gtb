import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { planBalance } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...corsHeaders(req), "cache-control": "no-store" } });
}

/**
 * Payment clearance for styling operations: a stylist only goes out for the
 * offline session once the client has paid in full, but stylists have no read
 * access to the payment ledger (Payment/PaymentMilestone policies cover CRO
 * and coach only). This route answers just the yes/no question, never the
 * amounts or proofs.
 *
 * Scope: founder/ops_head see every client with styling work; any other
 * staff member only the clients they style (operation stylist or active
 * styling consultant). Clients are refused.
 */
export type StylingPaymentStatus =
  | "paid_in_full" // agreed price fully settled by approved payments/waivers
  | "under_review" // balance would clear once pending submissions are approved
  | "balance_due"
  | "price_pending" // no agreed price recorded yet, so "paid" can't be judged
  | "not_enrolled";

async function handleGet(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role === "client") return json(req, { error: "Forbidden" }, 403);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  // Clients on the styling team's desk: those with a styling operation or a
  // Styling Blueprint (admins), or those the caller styles (stylist on an
  // operation, or the client's active styling consultant).
  const clients = await prisma.client.findMany({
    where: isAdmin
      ? { OR: [{ stylingOps: { some: {} } }, { stylingBlueprint: { isNot: null } }] }
      : {
          OR: [
            { stylingOps: { some: { stylistId: authUser.id } } },
            { assignments: { some: { staffId: authUser.id, isActive: true, role: "styling_consultant" } } },
          ],
        },
    select: {
      id: true,
      clientPlan: {
        select: {
          agreedPrice: true,
          payments: {
            where: { status: { in: ["approved", "pending_review"] } },
            select: { amount: true, status: true },
          },
        },
      },
    },
  });
  const ops = clients.map((c) => ({ clientId: c.id, client: { clientPlan: c.clientPlan } }));

  const statuses: Record<string, StylingPaymentStatus> = {};
  for (const op of ops) {
    const plan = op.client.clientPlan;
    let status: StylingPaymentStatus;
    if (!plan) status = "not_enrolled";
    else {
      const balance = planBalance(plan.agreedPrice, plan.payments);
      if (balance == null) status = "price_pending";
      else if (balance === 0) status = "paid_in_full";
      else {
        const pending = plan.payments
          .filter((p) => p.status === "pending_review")
          .reduce((t, p) => t + p.amount, 0);
        status = pending >= balance ? "under_review" : "balance_due";
      }
    }
    statuses[op.clientId] = status;
  }
  return json(req, { statuses });
}

export const GET = withRequestLog(handleGet);
