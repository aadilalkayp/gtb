import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import {
  generateServiceSessions,
  SERVICE_TO_CONSULTANT_ROLE,
  CONSULTANT_ROLES,
  type ServiceType,
} from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const ASSIGNERS = new Set(["founder", "ops_head"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Activate a converted client (SRS §6.1 steps 12–14, §7.3). Generates the session
 * schedule from the plan's service rules + wedding date, attaching the assigned
 * consultant per service, then flips the client to Active and sends a welcome.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!ASSIGNERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let clientId: string | undefined;
  try {
    ({ clientId } = (await req.json()) as { clientId?: string });
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      status: true,
      weddingDate: true,
      userId: true,

      clientPlan: {
        select: { enrolledAt: true, plan: { select: { services: true } } },
      },
      assignments: {
        where: { isActive: true },
        select: { role: true, staffId: true },
      },
      _count: { select: { sessions: true, followUps: true } },
    },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);
  if (!client.clientPlan) return json(req, { error: "Client has no plan" }, 409);
  if (client.status !== "converted" && client.status !== "active") {
    return json(req, { error: "Only a converted client can be activated" }, 409);
  }

  const consultantByRole = new Map<string, string>();
  for (const a of client.assignments) consultantByRole.set(a.role, a.staffId);
  const hasConsultant = CONSULTANT_ROLES.some((r) => consultantByRole.has(r));
  if (!hasConsultant) {
    return json(req, { error: "Assign at least one consultant before activating" }, 409);
  }

  // Idempotent: don't regenerate if a schedule already exists.
  let sessionsCreated = 0;
  if (client._count.sessions === 0) {
    const enrolledAt = client.clientPlan.enrolledAt;
    const rows = client.clientPlan.plan.services.flatMap((svc) => {
      const sessions = generateServiceSessions(
        {
          serviceType: svc.serviceType,
          totalSessions: svc.totalSessions,
          startOffsetDays: svc.startOffsetDays,
          frequencyDays: svc.frequencyDays,
        },
        client.weddingDate,
        enrolledAt,
      );
      const consultantId =
        consultantByRole.get(SERVICE_TO_CONSULTANT_ROLE[svc.serviceType as ServiceType]) ?? null;
      return sessions.map((s) => ({
        clientId: client.id,
        serviceType: s.serviceType,
        consultantId,
        sessionNumber: s.sessionNumber,
        scheduledDate: s.scheduledDate,
      }));
    });
    if (rows.length > 0) {
      const result = await prisma.session.createMany({ data: rows });
      sessionsCreated = result.count;
    }
  }

  if (client.status !== "active") {
    await prisma.client.update({ where: { id: client.id }, data: { status: "active" } });
  }

  // Seed the CRO's recurring follow-ups (SRS §12.3). Completing one auto-creates
  // the next, so only the first of each cadence is needed here.
  const croId = consultantByRole.get("cro");
  if (croId && client._count.followUps === 0) {
    const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    await prisma.followUp.createMany({
      data: [
        { clientId: client.id, croId, type: "weekly_checkin", dueDate: inDays(7) },
        { clientId: client.id, croId, type: "progress_update", dueDate: inDays(14) },
      ],
    });
  }

  if (client.userId) {
    await notifyUsers([client.userId], {
      type: "client_activated",
      title: "Your program is live 🎉",
      body: "Your team is assigned and your sessions are scheduled. Check your calendar.",
      linkPath: "/portal/sessions",
    });
  }

  return json(req, { ok: true, sessionsCreated });
}
