import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { deleteObjects } from "@/lib/storage";
import { canWorkBlueprint, stylingAccess } from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Remove an optional (outfit / inspiration) photo. Required slots can only be
 * replaced, never emptied, so a submitted set always stays complete.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const body = await readJson<{ photoId: string }>(req);
  if (!body?.photoId) return json(req, { error: "photoId is required" }, 400);

  const photo = await prisma.stylingPhoto.findUnique({
    where: { id: body.photoId },
    select: {
      slot: true,
      documentId: true,
      document: { select: { fileUrl: true } },
      blueprint: { select: { clientId: true } },
    },
  });
  if (!photo) return json(req, { error: "Photo not found" }, 404);

  const access = await stylingAccess(user, photo.blueprint.clientId);
  if (!access || (!access.isOwner && !canWorkBlueprint(access)))
    return json(req, { error: "Forbidden" }, 403);
  if (access.archived)
    return json(req, { error: "This programme has ended, so photos can't be changed" }, 409);
  if (photo.slot !== "extra")
    return json(req, { error: "Required photos can be replaced but not removed" }, 409);

  await prisma.document.delete({ where: { id: photo.documentId } });
  await deleteObjects([photo.document.fileUrl]);
  return json(req, { ok: true });
}

export const POST = withRequestLog(handlePost);
