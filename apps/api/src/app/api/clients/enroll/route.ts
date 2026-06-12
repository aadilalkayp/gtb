import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { generateInstallments, LEAD_PHASE_ORDER } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const STAFF_ENROLLERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Enroll a client in a plan (SRS §6.1 step 5 + §8.2).
 *
 * Creates the ClientPlan (with a price/name snapshot) and the generated
 * installment schedule. Runs server-side because the schema restricts
 * ClientPlan/Installment creation to staff — here we additionally allow the
 * client to enroll themselves during onboarding, validated by ownership.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let body: { clientId?: string; planId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, planId } = body;
  if (!clientId || !planId) {
    return json(req, { error: "clientId and planId are required" }, 400);
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { clientPlan: { select: { id: true } } },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);

  const isOwner = client.userId === authUser.id;
  const isStaff = STAFF_ENROLLERS.has(authUser.role);
  if (!isOwner && !isStaff) return json(req, { error: "Forbidden" }, 403);

  if (client.status !== "lead") {
    return json(req, { error: "Client is no longer a lead" }, 409);
  }
  if (client.clientPlan) {
    return json(req, { error: "Client is already enrolled in a plan" }, 409);
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { services: true },
  });
  if (!plan || !plan.isActive) {
    return json(req, { error: "Plan not available" }, 404);
  }
  if (plan.clientType !== client.type) {
    return json(req, { error: "Plan does not match the client's program" }, 409);
  }

  const enrolledAt = new Date();
  const installments = generateInstallments(
    plan.price,
    plan.installmentCount,
    plan.durationMonths,
    enrolledAt,
  );

  const clientPlan = await prisma.clientPlan.create({
    data: {
      clientId: client.id,
      planId: plan.id,
      planNameSnapshot: plan.name,
      priceAtEnrollment: plan.price,
      durationMonths: plan.durationMonths,
      enrolledAt,
      installments: {
        create: installments.map((i) => ({
          installmentNumber: i.installmentNumber,
          amount: i.amount,
          dueDate: i.dueDate,
        })),
      },
    },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });

  if (LEAD_PHASE_ORDER[client.leadPhase] < LEAD_PHASE_ORDER.plan_selected) {
    await prisma.client.update({
      where: { id: client.id },
      data: { leadPhase: "plan_selected" },
    });
  }

  return json(req, { clientPlan });
}
