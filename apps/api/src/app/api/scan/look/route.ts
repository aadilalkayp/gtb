import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { LOOK_DAILY_CAP_PER_SCAN, findLook, istStartOfDay, istMonthStart } from "@gtb/shared";
import { generateLook } from "@/lib/gemini";
import { authorizeScanAccess, clientIp, rateLimit } from "@/lib/scan";
import { createScanSignedUrl, downloadScanObject, uploadScanObject } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Global monthly render budget — image generation costs real money per call. */
const MONTHLY_CAP = Number(process.env.LOOK_PREVIEW_MONTHLY_CAP ?? 500);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

async function serialize(look: {
  id: string;
  kind: string;
  styleKey: string;
  status: string;
  path: string | null;
  error: string | null;
  createdAt: Date;
}) {
  return {
    id: look.id,
    kind: look.kind,
    styleKey: look.styleKey,
    status: look.status,
    url: look.path ? await createScanSignedUrl(look.path, 3600) : null,
    error: look.error,
    createdAt: look.createdAt.toISOString(),
  };
}

/**
 * Hairstyle / beard preview (Step 4 of the brief): render a catalog style onto
 * the person's own selfie. Gated to claimed scans (email captured), capped per
 * scan per day and globally per month. Synchronous — generation takes a few
 * seconds and the UI shows a spinner per tile.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  let body: { scanId?: string; styleKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const access = await authorizeScanAccess(req, body.scanId, { requireClaimed: true });
  if (!access.ok) return json(req, { error: access.error }, access.status);
  const { scan } = access;

  const style = body.styleKey ? findLook(scan.type, body.styleKey) : undefined;
  if (!style) return json(req, { error: "Unknown style" }, 400);
  if (!rateLimit(`look-ip:${clientIp(req)}`, 40))
    return json(req, { error: "Too many requests" }, 429);

  // Reuse a finished render of the same style instead of paying again.
  const existing = await prisma.lookPreview.findFirst({
    where: { scanId: scan.id, styleKey: style.key, status: "ready" },
  });
  if (existing) return json(req, { ok: true, look: await serialize(existing), cached: true });

  const [todayCount, monthCount] = await Promise.all([
    prisma.lookPreview.count({
      where: {
        scanId: scan.id,
        createdAt: { gte: istStartOfDay(new Date()) },
        status: { not: "failed" },
      },
    }),
    prisma.lookPreview.count({
      where: { createdAt: { gte: istMonthStart(new Date()) }, status: "ready" },
    }),
  ]);
  if (todayCount >= LOOK_DAILY_CAP_PER_SCAN) {
    return json(
      req,
      { error: `That's ${LOOK_DAILY_CAP_PER_SCAN} previews for today. More tomorrow.` },
      429,
    );
  }
  if (monthCount >= MONTHLY_CAP) {
    requestLog(req).warn("look preview monthly cap reached", { monthCount, MONTHLY_CAP });
    return json(req, { error: "Previews are paused for the rest of the month." }, 503);
  }

  const look = await prisma.lookPreview.create({
    data: { scanId: scan.id, clientId: scan.clientId, kind: style.kind, styleKey: style.key },
  });

  try {
    const face = await downloadScanObject(scan.photoPath);
    const mime = face[0] === 0x89 ? "image/png" : face[0] === 0x52 ? "image/webp" : "image/jpeg";
    const image = await generateLook({
      face: { data: face, mimeType: mime },
      stylePrompt: style.prompt,
      kind: style.kind,
    });
    const path = `${scan.clientId ?? "anonymous"}/looks/${look.id}.${image.mimeType.split("/")[1] || "png"}`;
    const { error } = await uploadScanObject(path, image.data, image.mimeType);
    if (error) throw new Error(error.message);
    const ready = await prisma.lookPreview.update({
      where: { id: look.id },
      data: { status: "ready", path, modelVersion: image.modelVersion },
    });
    return json(req, { ok: true, look: await serialize(ready) });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "generation failed";
    requestLog(req).error("look generation failed", { lookId: look.id, error: e });
    await prisma.lookPreview.update({
      where: { id: look.id },
      data: { status: "failed", error: reason.slice(0, 300) },
    });
    return json(req, { error: "We couldn't render that look right now. Try another style." }, 502);
  }
}

async function handleGet(req: NextRequest): Promise<Response> {
  const access = await authorizeScanAccess(req, req.nextUrl.searchParams.get("scanId"), {
    requireScored: false,
  });
  if (!access.ok) return json(req, { error: access.error }, access.status);
  const { scan } = access;
  const looks = await prisma.lookPreview.findMany({
    where: { scanId: scan.id, status: "ready" },
    orderBy: { createdAt: "desc" },
  });
  const today = await prisma.lookPreview.count({
    where: {
      scanId: scan.id,
      createdAt: { gte: istStartOfDay(new Date()) },
      status: { not: "failed" },
    },
  });
  return json(req, {
    looks: await Promise.all(looks.map(serialize)),
    remainingToday: Math.max(0, LOOK_DAILY_CAP_PER_SCAN - today),
  });
}

export const POST = withRequestLog(handlePost);
export const GET = withRequestLog(handleGet);
