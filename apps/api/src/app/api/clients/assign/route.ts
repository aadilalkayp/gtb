import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { ASSIGNMENT_ROLES, type AssignmentRole } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const ASSIGNERS = new Set(["founder", "ops_head"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

interface AssignInput {
  role: string;
  staffId: string;
}

/**
 * Assign / reassign a client's team (SRS §14, §6.1 step 11). Each role keeps one
 * active assignment; reassigning deactivates the previous one (history preserved).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!ASSIGNERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { clientId?: string; assignments?: AssignInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, assignments } = body;
  if (!clientId || !Array.isArray(assignments) || assignments.length === 0) {
    return json(req, { error: "clientId and assignments[] are required" }, 400);
  }
  for (const a of assignments) {
    if (!a?.staffId || !ASSIGNMENT_ROLES.includes(a.role as AssignmentRole)) {
      return json(req, { error: "Each assignment needs a valid role and staffId" }, 400);
    }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, status: true },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);
  if (client.status !== "converted" && client.status !== "active") {
    return json(req, { error: "Assign a team only after the client is converted" }, 409);
  }

  // All target staff must exist and be active.
  const staffIds = [...new Set(assignments.map((a) => a.staffId))];
  const staff = await prisma.user.findMany({
    where: { id: { in: staffIds }, isActive: true },
    select: { id: true },
  });
  if (staff.length !== staffIds.length) {
    return json(req, { error: "One or more staff members are invalid or inactive" }, 400);
  }

  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      const existing = await tx.assignment.findFirst({
        where: { clientId: client.id, role: a.role as AssignmentRole, isActive: true },
        select: { id: true, staffId: true },
      });
      if (existing?.staffId === a.staffId) continue; // unchanged
      if (existing) {
        await tx.assignment.update({
          where: { id: existing.id },
          data: { isActive: false, unassignedAt: new Date() },
        });
      }
      await tx.assignment.create({
        data: {
          clientId: client.id,
          staffId: a.staffId,
          role: a.role as AssignmentRole,
          assignedById: authUser.id,
        },
      });
    }
  });

  return json(req, { ok: true });
}
