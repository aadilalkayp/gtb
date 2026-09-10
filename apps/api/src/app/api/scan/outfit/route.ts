import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { analyzeOutfits, type GarmentInput } from "@/lib/gemini";
import { authorizeScanAccess, clientIp, rateLimit } from "@/lib/scan";
import { createScanSignedUrl, downloadScanObject, uploadScanObject } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_GARMENTS = 3;
const CHECKS_PER_DAY_PER_SCAN = 10;

const MAGIC: { mime: string; sig: number[] }[] = [
  { mime: "image/jpeg", sig: [0xff, 0xd8, 0xff] },
  { mime: "image/png", sig: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", sig: [0x52, 0x49, 0x46, 0x46] },
];
const sniff = (b: Buffer) => MAGIC.find((m) => m.sig.every((x, i) => b[i] === x))?.mime;

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

async function serialize(check: {
  id: string;
  createdAt: Date;
  photoPaths: string[];
  results: unknown;
  palette: unknown;
  modelVersion: string | null;
}) {
  return {
    id: check.id,
    createdAt: check.createdAt.toISOString(),
    photos: await Promise.all(check.photoPaths.map((p) => createScanSignedUrl(p, 3600))),
    results: check.results ?? [],
    palette: check.palette ?? null,
    modelVersion: check.modelVersion,
  };
}

/**
 * Outfit analysis (Step 3 of the brief): up to three garment photos judged
 * against the person's skin tone from their scan selfie. Available from the
 * report page (scanId = bearer secret; claimed scans only — it costs a model
 * call) and the portal.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }
  const scanId = form.get("scanId");
  const access = await authorizeScanAccess(req, typeof scanId === "string" ? scanId : null, {
    requireClaimed: true,
  });
  if (!access.ok) return json(req, { error: access.error }, access.status);
  const { scan } = access;

  if (
    !rateLimit(
      `outfit:${scan.id}:${new Date().toISOString().slice(0, 10)}`,
      CHECKS_PER_DAY_PER_SCAN,
    )
  ) {
    return json(req, { error: "That's the outfit checks for today. Come back tomorrow." }, 429);
  }
  if (!rateLimit(`outfit-ip:${clientIp(req)}`, 30))
    return json(req, { error: "Too many requests" }, 429);

  const garments: GarmentInput[] = [];
  for (let i = 1; i <= MAX_GARMENTS; i++) {
    const f = form.get(`garment${i}`);
    if (!f || typeof f === "string" || typeof f.arrayBuffer !== "function") continue;
    if (f.size > MAX_BYTES) return json(req, { error: `Garment ${i} is larger than 10 MB` }, 413);
    const data = Buffer.from(await f.arrayBuffer());
    const mime = sniff(data);
    if (!mime) return json(req, { error: "Only JPEG, PNG or WebP photos are supported" }, 415);
    garments.push({ data, mimeType: mime });
  }
  if (!garments.length) return json(req, { error: "Add at least one garment photo" }, 400);

  const dir = `${scan.clientId ?? "anonymous"}/outfits`;
  const photoPaths: string[] = [];
  for (const g of garments) {
    const path = `${dir}/${crypto.randomUUID()}.${g.mimeType.split("/")[1]}`;
    const { error } = await uploadScanObject(path, g.data, g.mimeType);
    if (error) {
      requestLog(req).error("outfit photo upload failed", { reason: error.message });
      return json(req, { error: "Could not store a photo. Please try again." }, 502);
    }
    photoPaths.push(path);
  }

  let face: GarmentInput | null = null;
  try {
    const data = await downloadScanObject(scan.photoPath);
    face = { data, mimeType: sniff(data) ?? "image/jpeg" };
  } catch (e) {
    requestLog(req).warn("outfit: selfie unavailable, analysing without skin-tone context", {
      error: e,
    });
  }

  try {
    const analysis = await analyzeOutfits({ type: scan.type, face, garments });
    const check = await prisma.outfitCheck.create({
      data: {
        scanId: scan.id,
        clientId: scan.clientId,
        photoPaths,
        modelVersion: analysis.modelVersion,
        results: analysis.results as object[],
        palette: analysis.palette as object,
      },
    });
    return json(req, { ok: true, check: await serialize(check) });
  } catch (e) {
    requestLog(req).error("outfit analysis failed", { scanId: scan.id, error: e });
    return json(
      req,
      { error: "We couldn't analyse those photos. Try clearer shots of each garment." },
      502,
    );
  }
}

async function handleGet(req: NextRequest): Promise<Response> {
  const access = await authorizeScanAccess(req, req.nextUrl.searchParams.get("scanId"), {
    requireScored: false,
  });
  if (!access.ok) return json(req, { error: access.error }, access.status);
  const { scan } = access;
  // History follows the person, not the scan: a client sees checks from all their scans.
  const checks = await prisma.outfitCheck.findMany({
    where: scan.clientId ? { clientId: scan.clientId } : { scanId: scan.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return json(req, { checks: await Promise.all(checks.map(serialize)) });
}

export const POST = withRequestLog(handlePost);
export const GET = withRequestLog(handleGet);
