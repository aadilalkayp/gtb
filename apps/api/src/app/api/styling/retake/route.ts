import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { PHOTO_SLOT_LABELS, type StylingPhotoSlot } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { notifyUsers } from "@/lib/notify";
import { PORTAL_STYLING_LINK, canWorkBlueprint, stylingAccess } from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const MAX_NOTE = 500;

/**
 * Ask the client to retake one photo, with a short reason they will see
 * ("Too dark, please retake near a window"). `cancel: true` withdraws the
 * request. While any photo is flagged the Blueprint shows "Retake requested";
 * the client's re-upload of that slot clears it (see /api/styling/photos).
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role === "client") return json(req, { error: "Forbidden" }, 403);
  const body = await readJson<{ photoId: string; note: string; cancel: boolean }>(req);
  if (!body?.photoId) return json(req, { error: "photoId is required" }, 400);
  const cancel = body.cancel === true;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!cancel && !note) return json(req, { error: "Tell the client what to change" }, 400);
  if (note.length > MAX_NOTE)
    return json(req, { error: `Keep the note under ${MAX_NOTE} characters` }, 400);

  const photo = await prisma.stylingPhoto.findUnique({
    where: { id: body.photoId },
    select: {
      id: true,
      slot: true,
      blueprint: { select: { id: true, clientId: true, status: true } },
    },
  });
  if (!photo) return json(req, { error: "Photo not found" }, 404);
  if (photo.slot === "extra")
    return json(req, { error: "Optional photos can't be sent back for a retake" }, 400);

  const access = await stylingAccess(user, photo.blueprint.clientId);
  if (!access || !canWorkBlueprint(access)) return json(req, { error: "Forbidden" }, 403);
  if (access.archived) return json(req, { error: "This programme has ended" }, 409);
  // Retakes belong to a review in progress. A published Blueprint has no open
  // submission (and no fresh due date); the client sends new photos first.
  if (photo.blueprint.status !== "under_review" && photo.blueprint.status !== "retake_requested") {
    return json(
      req,
      {
        error:
          photo.blueprint.status === "awaiting_photos"
            ? "Wait until the client sends their photos"
            : "Retakes are only possible while the photos are under review",
      },
      409,
    );
  }

  const status = await prisma.$transaction(async (tx) => {
    await tx.stylingPhoto.update({
      where: { id: photo.id },
      data: cancel
        ? { retakeNote: null, retakeRequestedAt: null }
        : { retakeNote: note, retakeRequestedAt: new Date() },
    });
    const flagged = await tx.stylingPhoto.count({
      where: { blueprintId: photo.blueprint.id, retakeNote: { not: null } },
    });
    const next =
      flagged > 0
        ? "retake_requested"
        : photo.blueprint.status === "retake_requested"
          ? "under_review"
          : photo.blueprint.status;
    if (next !== photo.blueprint.status) {
      await tx.stylingBlueprint.update({
        where: { id: photo.blueprint.id },
        data: { status: next },
      });
    }
    return next;
  });

  if (!cancel && access.clientUserId) {
    await notifyUsers([access.clientUserId], {
      type: "styling_retake_requested",
      title: "Your stylist needs a new photo",
      body: `Please retake your ${PHOTO_SLOT_LABELS[photo.slot as StylingPhotoSlot].toLowerCase()} photo: ${note}`,
      linkPath: PORTAL_STYLING_LINK,
    });
  }
  return json(req, { ok: true, status });
}

export const POST = withRequestLog(handlePost);
