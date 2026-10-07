import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { PHOTO_SLOT_LABELS, type StylingPhotoSlot } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { createDownloadUrl, createSignedUrls } from "@/lib/storage";
import { canViewBlueprint, stylingAccess } from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Staff view of a client's styling files in one call: their photos (with a
 * view URL and a download URL named by slot) and every stylist image, keyed
 * by document id, so the editor and preview can render without one request
 * per thumbnail.
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

  const [photos, images] = await Promise.all([
    prisma.stylingPhoto.findMany({
      where: { blueprint: { clientId: access.clientId } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slot: true,
        documentId: true,
        retakeNote: true,
        retakeRequestedAt: true,
        createdAt: true,
        document: { select: { fileUrl: true, fileName: true } },
      },
    }),
    prisma.document.findMany({
      where: { clientId: access.clientId, type: "styling_image" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, fileUrl: true, createdAt: true },
    }),
  ]);

  const urls = await createSignedUrls([
    ...photos.map((p) => p.document.fileUrl),
    ...images.map((i) => i.fileUrl),
  ]);
  let extra = 0;
  const photoRows = await Promise.all(
    photos.map(async (p) => {
      const ext = p.document.fileUrl.toLowerCase().endsWith(".png") ? "png" : "jpg";
      const label =
        p.slot === "extra"
          ? `extra-${++extra}`
          : PHOTO_SLOT_LABELS[p.slot as StylingPhotoSlot].toLowerCase().replace(/[^a-z0-9]+/g, "-");
      let downloadUrl: string | null = null;
      try {
        downloadUrl = await createDownloadUrl(
          p.document.fileUrl,
          `${access.clientCode}-${label}.${ext}`,
        );
      } catch {
        downloadUrl = null;
      }
      return {
        id: p.id,
        slot: p.slot,
        documentId: p.documentId,
        retakeNote: p.retakeNote,
        retakeRequestedAt: p.retakeRequestedAt,
        createdAt: p.createdAt,
        url: urls.get(p.document.fileUrl) ?? null,
        downloadUrl,
      };
    }),
  );

  return json(req, {
    photos: photoRows,
    images: images.map((i) => ({
      id: i.id,
      fileName: i.fileName,
      createdAt: i.createdAt,
      url: urls.get(i.fileUrl) ?? null,
    })),
  });
}

export const POST = withRequestLog(handlePost);
