import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { analyzeSelfie } from "@/lib/gemini";
import { buildScanReport, clientIp, rateLimit, syncRoadmap } from "@/lib/scan";
import { uploadScanObject } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const MAX_BYTES = 10 * 1024 * 1024;
const SCANS_PER_HOUR_PER_IP = 6;

// Selfies only — JPEG/PNG/WebP, verified against magic bytes (file.type is
// client-controlled and untrusted, same as documents/upload).
const MAGIC_BYTES: { mime: string; signature: number[] }[] = [
  { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", signature: [0x52, 0x49, 0x46, 0x46] },
];

function sniffMime(buffer: Buffer): string | undefined {
  for (const { mime, signature } of MAGIC_BYTES) {
    if (signature.every((b, i) => buffer[i] === b)) return mime;
  }
  return undefined;
}

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Start a Transformation Readiness Scan: store the selfie, run the vision pipeline,
 * return the scored result.
 *
 * The product's only unauthenticated write surface (the free funnel runs
 * pre-registration), so it is IP rate-limited and creates nothing but the Scan
 * row itself. Two calling modes:
 *   - Anonymous (funnel): the scan is unclaimed (clientId null) and the
 *     response carries only a teaser score — the full report unlocks via
 *     /api/scan/claim. Unclaimed scans are purged after 24h by the daily job.
 *   - Authenticated client (portal rescan): the scan attaches to their Client
 *     row immediately, future roadmap weeklies are regenerated from the new
 *     scores, and the full report returns directly.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  if (!rateLimit(`scan:${clientIp(req)}`, SCANS_PER_HOUR_PER_IP)) {
    return json(req, { error: "Too many scans from this network. Try again in an hour." }, 429);
  }

  // Optional auth: a logged-in client rescans against their own record.
  const authUser = await resolveAuthUser(req).catch(() => undefined);
  const ownClient = authUser
    ? await prisma.client.findFirst({
        where: { userId: authUser.id },
        select: { id: true, weddingDate: true, type: true },
      })
    : null;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return json(req, { error: "A selfie file is required" }, 400);
  }
  if (file.size > MAX_BYTES) return json(req, { error: "Photo is larger than 10 MB" }, 413);

  // Wedding date: the client's own for a portal rescan, else from the form.
  let weddingDate: Date;
  let type: "groom" | "bride";
  if (ownClient) {
    weddingDate = ownClient.weddingDate;
    type = ownClient.type;
  } else {
    const rawDate = form.get("weddingDate");
    if (typeof rawDate !== "string" || !rawDate) {
      return json(req, { error: "weddingDate is required" }, 400);
    }
    weddingDate = new Date(rawDate);
    if (Number.isNaN(weddingDate.getTime())) {
      return json(req, { error: "weddingDate is not a valid date" }, 400);
    }
    if (weddingDate.getTime() < Date.now()) {
      return json(req, { error: "The wedding date must be in the future" }, 400);
    }
    const rawType = form.get("type");
    type = rawType === "bride" ? "bride" : "groom";
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed) return json(req, { error: "Only JPEG, PNG or WebP photos are supported" }, 415);

  const photoPath = `${ownClient?.id ?? "anonymous"}/${crypto.randomUUID()}.${sniffed.split("/")[1]}`;
  const { error: uploadError } = await uploadScanObject(photoPath, buffer, sniffed);
  if (uploadError) {
    requestLog(req).error("scan photo upload failed", { reason: uploadError.message });
    return json(req, { error: "Could not store the photo. Please try again." }, 502);
  }

  const scan = await prisma.scan.create({
    data: { clientId: ownClient?.id ?? null, photoPath, weddingDate, type, source: "web" },
  });

  // Score synchronously — the funnel shows the result on the next screen.
  let scored;
  try {
    const analysis = await analyzeSelfie(buffer, sniffed);

    // Framing gate: the scan only accepts a close-up with face AND hair in
    // frame. Validated by the same model call that scores, so rejection costs
    // nothing extra. The client-side FaceDetector pre-check is UX only — this
    // is the enforcement.
    const { framing } = analysis;
    if (!framing.faceDetected || !framing.isCloseUp || !framing.hairVisible) {
      const reason = !framing.faceDetected
        ? "We couldn't find a face in that photo. Take a front-facing selfie."
        : !framing.isCloseUp
          ? "Come closer — your face should fill most of the frame."
          : "Keep your hair in the shot — tilt the camera up a little.";
      await prisma.scan.update({
        where: { id: scan.id },
        data: { status: "failed", failureReason: `framing: ${reason}` },
      });
      return json(req, { error: reason }, 422);
    }

    scored = await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "scored",
        modelVersion: analysis.modelVersion,
        skinScore: analysis.scores.skinScore,
        hairScore: analysis.scores.hairScore,
        beardScore: analysis.scores.beardScore,
        styleScore: analysis.scores.styleScore,
        readinessScore: analysis.scores.readinessScore,
        focusAreas: analysis.focusAreas.map((f) => ({ area: f.area, weight: f.weight })),
        highlights: analysis.highlights,
        suggestions: analysis.suggestions,
      },
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "analysis failed";
    requestLog(req).error("scan analysis failed", { scanId: scan.id, error: e });
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: "failed", failureReason: reason.slice(0, 500) },
    });
    return json(
      req,
      { error: "We couldn't analyze that photo. Try a clearer, front-facing selfie." },
      502,
    );
  }

  if (ownClient) {
    await syncRoadmap(ownClient.id, scored, ownClient.weddingDate);
    return json(req, { ok: true, report: await buildScanReport(scored, ownClient.weddingDate) });
  }

  // Anonymous teaser: readiness + countdown only; the breakdown unlocks at claim.
  return json(req, {
    ok: true,
    scanId: scored.id,
    teaser: {
      readinessScore: scored.readinessScore,
      daysToWedding: Math.max(
        0,
        Math.ceil((weddingDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      ),
    },
  });
}

export const POST = withRequestLog(handlePost);
