import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { PAYMENT_METHODS, type PaymentMethod } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers, getAdminUserIds } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const APPROVERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Approve (or manually record) a payment (SRS §8.3 / §8.5). Marks the installment
 * approved with a payment method; the client's first-ever approval converts them
 * Lead → Converted (SRS §6.1 step 9) and notifies admins to assign a team.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!APPROVERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { installmentId?: string; paymentMethod?: string; notes?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { installmentId, paymentMethod, notes } = body;
  if (!installmentId) return json(req, { error: "installmentId is required" }, 400);
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return json(req, { error: "A valid paymentMethod is required" }, 400);
  }

  const installment = await prisma.installment.findUnique({
    where: { id: installmentId },
    include: {
      clientPlan: {
        select: {
          clientId: true,
          client: { select: { id: true, status: true, name: true } },
        },
      },
    },
  });
  if (!installment) return json(req, { error: "Installment not found" }, 404);
  if (installment.status === "approved") {
    return json(req, { error: "This installment is already approved" }, 409);
  }
  if (installment.status === "waived") {
    return json(req, { error: "This installment was waived" }, 409);
  }

  const client = installment.clientPlan.client;

  // CROs may only act on clients they are actively assigned to.
  if (authUser.role === "cro") {
    const assigned = await prisma.assignment.findFirst({
      where: { clientId: client.id, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  // Is this the client's first approved payment? (decided before we write)
  const priorApproved = await prisma.installment.count({
    where: {
      clientPlan: { clientId: client.id },
      status: "approved",
      id: { not: installment.id },
    },
  });
  const isFirstApproval = priorApproved === 0;
  const shouldConvert = isFirstApproval && client.status === "lead";

  await prisma.installment.update({
    where: { id: installment.id },
    data: {
      status: "approved",
      paymentMethod: paymentMethod as PaymentMethod,
      approvedById: authUser.id,
      approvedAt: new Date(),
      rejectionReason: null,
      ...(notes ? { notes } : {}),
    },
  });

  if (shouldConvert) {
    await prisma.client.update({
      where: { id: client.id },
      data: { status: "converted", conversionDate: new Date(), convertedById: authUser.id },
    });
    const admins = await getAdminUserIds();
    await notifyUsers(
      admins.filter((id) => id !== authUser.id),
      {
        type: "client_converted",
        title: "New converted client",
        body: `${client.name} has paid and is ready for team assignment.`,
        linkPath: "/assignments",
      },
    );
  }

  return json(req, { ok: true, converted: shouldConvert });
}
