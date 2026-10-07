import type { NextRequest } from "next/server";
import { zipSync } from "fflate";
import { prisma } from "@gtb/db";
import { PHOTO_SLOT_LABELS, type StylingPhotoSlot } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { downloadObject } from "@/lib/storage";
import { canViewBlueprint, stylingAccess } from "@/lib/styling";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * "Download all": every styling photo of a client as one ZIP, named by slot
 * so the stylist's editing folder is tidy (GTB1256-front.jpg, ...). Photos
 * are already compressed, so entries are stored, not deflated.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role === "client") return json(req, { error: "Forbidden" }, 403);
  const body = await readJson<{ clientId: string }>(req);
  if (!body?.clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await stylingAccess(user, body.clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!canViewBlueprint(access)) return json(req, { error: "Forbidden" }, 403);

  const photos = await prisma.stylingPhoto.findMany({
    where: { blueprint: { clientId: access.clientId } },
    orderBy: { createdAt: "asc" },
    select: { slot: true, document: { select: { fileUrl: true, fileName: true } } },
  });
  if (!photos.length) return json(req, { error: "No photos yet" }, 404);

  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  let extra = 0;
  for (const p of photos) {
    try {
      const buf = await downloadObject(p.document.fileUrl);
      const ext = p.document.fileUrl.toLowerCase().endsWith(".png") ? "png" : "jpg";
      const label =
        p.slot === "extra"
          ? `extra-${++extra}`
          : PHOTO_SLOT_LABELS[p.slot as StylingPhotoSlot].toLowerCase().replace(/[^a-z0-9]+/g, "-");
      files[`${access.clientCode}-${label}.${ext}`] = [new Uint8Array(buf), { level: 0 }];
    } catch (error) {
      requestLog(req).warn("styling photo missing from storage", {
        path: p.document.fileUrl,
        error,
      });
    }
  }
  if (!Object.keys(files).length)
    return json(req, { error: "Photos could not be read. Try again." }, 502);

  const zip = zipSync(files);
  return new Response(Buffer.from(zip), {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${access.clientCode}-styling-photos.zip"`,
      "cache-control": "no-store",
    },
  });
}

export const POST = withRequestLog(handlePost);
