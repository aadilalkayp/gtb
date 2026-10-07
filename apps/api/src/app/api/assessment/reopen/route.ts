import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { notifyUsers } from "@/lib/notify";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Founder / ops head reopen a submitted assessment so the client can change
 * their answers or photos. The previous answers stay in place as the
 * starting point; the client is told and resubmits from their portal.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role !== "founder" && user.role !== "ops_head") {
    return json(req, { error: "Forbidden" }, 403);
  }
  const body = await readJson<{ clientId: string }>(req);
  if (!body?.clientId) return json(req, { error: "clientId is required" }, 400);

  const assessment = await prisma.assessment.findUnique({
    where: { clientId: body.clientId },
    select: { submittedAt: true, client: { select: { userId: true } } },
  });
  if (!assessment?.submittedAt) {
    return json(req, { error: "The assessment hasn't been submitted yet" }, 409);
  }
  await prisma.assessment.update({
    where: { clientId: body.clientId },
    data: { submittedAt: null, reopenedAt: new Date() },
  });
  if (assessment.client.userId) {
    await notifyUsers([assessment.client.userId], {
      type: "assessment_reopened",
      title: "Please update your pre-consultation assessment",
      body: "Your team has reopened your assessment so you can update your answers or photos.",
      linkPath: "/portal/assessment",
    });
  }
  return json(req, { ok: true });
}

export const POST = withRequestLog(handlePost);
