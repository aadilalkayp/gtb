import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { PHOTO_SLOT_LABELS, blueprintDueAt, formatDate, missingRequiredSlots } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { getAdminUserIds, notifyUsers } from "@/lib/notify";
import {
  ensureBlueprint,
  ownClientId,
  staffBlueprintLink,
  stylingAccess,
  stylistUserIds,
} from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * The client hands their photos to the stylist. Requires every required slot.
 * First time: Awaiting photos -> Under review. After a Blueprint is published
 * the client can send new photos (a haircut, a fitting): the Blueprint goes
 * back to Under review while the published version stays visible.
 * The due date is 5 working days out and the stylist is notified.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId = await ownClientId(user);
  if (!clientId) return json(req, { error: "Forbidden" }, 403);

  const access = await stylingAccess(user, clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (access.archived) return json(req, { error: "This programme has ended" }, 409);

  const bp = await ensureBlueprint(clientId);
  if (bp.status === "under_review" || bp.status === "retake_requested") {
    return json(req, { error: "Your photos are already with your stylist" }, 409);
  }

  const photos = await prisma.stylingPhoto.findMany({
    where: { blueprintId: bp.id },
    select: { slot: true },
  });
  const missing = missingRequiredSlots(photos.map((p) => p.slot));
  if (missing.length) {
    return json(
      req,
      {
        error: `Add these photos first: ${missing.map((s) => PHOTO_SLOT_LABELS[s]).join(", ")}`,
        missing,
      },
      400,
    );
  }

  const now = new Date();
  const dueAt = blueprintDueAt(now);
  const isUpdate = bp.status === "published";
  // Conditional update: two taps on Submit can't both move the status.
  const moved = await prisma.stylingBlueprint.updateMany({
    where: { id: bp.id, status: bp.status },
    data: { status: "under_review", photosSubmittedAt: now, dueAt },
  });
  if (moved.count === 0)
    return json(req, { error: "Your photos are already with your stylist" }, 409);

  const stylists = await stylistUserIds(clientId);
  await notifyUsers(stylists.length ? stylists : await getAdminUserIds(), {
    type: "styling_photos_submitted",
    title: isUpdate
      ? `${access.clientName} sent new photos`
      : `${access.clientName} sent their styling photos`,
    body: `Blueprint ${isUpdate ? "update " : ""}due by ${formatDate(dueAt)}.`,
    linkPath: staffBlueprintLink(clientId),
  });

  return json(req, { ok: true, status: "under_review", dueAt });
}

export const POST = withRequestLog(handlePost);
