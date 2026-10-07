import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import {
  LEAD_PHASE_ORDER,
  SKIN_PHOTO_ANGLES,
  SKIN_PHOTO_ANGLE_LABELS,
  preConsultationSchema,
  preConsultationToAssessment,
  type LeadPhase,
} from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { clientCanEdit, notifyAssessmentSubmitted, ownClientId } from "@/lib/assessment";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Submit the Pre-Consultation Assessment (spec §9, §17). The whole form is
 * validated here, not just in the browser: required answers, conditional
 * details, both consents and all three skin photos. On success the structured
 * answers are saved (the PDF is rendered from them on demand) and the
 * operations team plus any assigned skincare consultant / fitness trainer are
 * notified.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId = await ownClientId(user);
  if (!clientId) return json(req, { error: "Only the client can submit their assessment" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const parsed = preConsultationSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    );
    return json(req, { error: "Please complete the highlighted questions", fieldErrors }, 400);
  }

  if (!(await clientCanEdit(clientId))) {
    return json(
      req,
      { error: "Your assessment has been submitted. Contact your team to make changes." },
      409,
    );
  }

  const [existing, photos, client] = await Promise.all([
    prisma.assessment.findUnique({
      where: { clientId },
      select: { submittedAt: true, reopenedAt: true, completedAt: true },
    }),
    prisma.skinPhoto.findMany({
      where: { assessment: { clientId } },
      select: { angle: true },
    }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { leadPhase: true } }),
  ]);
  const have = new Set(photos.map((p) => p.angle));
  const missing = SKIN_PHOTO_ANGLES.filter((a) => !have.has(a));
  if (missing.length) {
    return json(
      req,
      {
        error: `Please upload all three skin photos. Missing: ${missing.map((a) => SKIN_PHOTO_ANGLE_LABELS[a]).join(", ")}.`,
        missingPhotos: missing,
      },
      400,
    );
  }

  const now = new Date();
  const data = {
    ...preConsultationToAssessment(parsed.data),
    submittedAt: now,
    completedAt: existing?.completedAt ?? now,
    reopenedAt: null,
  };
  await prisma.$transaction(async (tx) => {
    await tx.assessment.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
    });
    if (LEAD_PHASE_ORDER[client.leadPhase as LeadPhase] < LEAD_PHASE_ORDER.registered) {
      await tx.client.update({ where: { id: clientId }, data: { leadPhase: "registered" } });
    }
  });

  const isUpdate = Boolean(existing?.submittedAt || existing?.reopenedAt);
  await notifyAssessmentSubmitted(clientId, isUpdate).catch((error) =>
    requestLog(req).error("assessment notification failed", { clientId, error }),
  );

  return json(req, { ok: true, submittedAt: now });
}

export const POST = withRequestLog(handlePost);
