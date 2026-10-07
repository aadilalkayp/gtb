import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import {
  MAX_EXTRA_PHOTOS,
  PHOTO_SLOT_LABELS,
  STYLING_PHOTO_SLOTS,
  type StylingPhotoSlot,
} from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { getAdminUserIds, notifyUsers } from "@/lib/notify";
import { createSignedUrl, deleteObjects, uploadObject } from "@/lib/storage";
import { IMAGE_MIME, readUpload } from "@/lib/uploads";
import {
  canWorkBlueprint,
  clientHasStyling,
  ensureBlueprint,
  ownClientId,
  staffBlueprintLink,
  stylingAccess,
  stylistUserIds,
} from "@/lib/styling";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Upload one styling photo into a guided slot (multipart: slot, file, and
 * clientId when staff upload on the client's behalf).
 *
 * A required slot holds one photo: a new upload replaces the old one. That is
 * also how a retake is answered, so when the last flagged photo is replaced
 * the Blueprint moves from "retake requested" back to "under review" and the
 * stylist is told. Optional `extra` photos are capped at MAX_EXTRA_PHOTOS.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }

  const slot = form.get("slot");
  if (typeof slot !== "string" || !(STYLING_PHOTO_SLOTS as readonly string[]).includes(slot)) {
    return json(req, { error: "slot must be one of " + STYLING_PHOTO_SLOTS.join(", ") }, 400);
  }

  // The client uploads for themself; staff name the client.
  const formClientId = form.get("clientId");
  const clientId =
    user.role === "client"
      ? await ownClientId(user)
      : typeof formClientId === "string"
        ? formClientId
        : null;
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await stylingAccess(user, clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!access.isOwner && !canWorkBlueprint(access)) return json(req, { error: "Forbidden" }, 403);
  if (access.archived)
    return json(req, { error: "This programme has ended, so photos can't be changed" }, 409);
  if (!(await clientHasStyling(clientId)))
    return json(req, { error: "Styling isn't part of this plan" }, 409);

  const bp = await ensureBlueprint(clientId);

  if (slot === "extra") {
    const extras = await prisma.stylingPhoto.count({
      where: { blueprintId: bp.id, slot: "extra" },
    });
    if (extras >= MAX_EXTRA_PHOTOS) {
      return json(req, { error: `You can add up to ${MAX_EXTRA_PHOTOS} optional photos` }, 409);
    }
  }

  const upload = await readUpload(form, IMAGE_MIME);
  if (!upload.ok) return json(req, { error: upload.error }, upload.status);
  const { file } = upload;

  const path = `${clientId}/styling_photo/${crypto.randomUUID()}-${file.safeName}`;
  const { error: storageError } = await uploadObject(path, file.buffer, file.mime);
  if (storageError) {
    requestLog(req).error("styling photo upload failed", { path, reason: storageError.message });
    return json(req, { error: "Upload failed. Please try again." }, 502);
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          clientId,
          type: "styling_photo",
          fileName: file.name,
          fileUrl: path,
          fileSize: file.size,
          uploadedById: user.id,
        },
      });
      const previous =
        slot === "extra"
          ? []
          : await tx.stylingPhoto.findMany({
              where: { blueprintId: bp.id, slot: slot as StylingPhotoSlot },
              select: {
                documentId: true,
                retakeNote: true,
                document: { select: { fileUrl: true } },
              },
            });
      if (previous.length) {
        // Deleting the Document cascades to its StylingPhoto row.
        await tx.document.deleteMany({ where: { id: { in: previous.map((p) => p.documentId) } } });
      }
      const created = await tx.stylingPhoto.create({
        data: { blueprintId: bp.id, slot: slot as StylingPhotoSlot, documentId: document.id },
      });

      const answered = previous.some((p) => p.retakeNote);
      let status = bp.status;
      if (answered && bp.status === "retake_requested") {
        const stillFlagged = await tx.stylingPhoto.count({
          where: { blueprintId: bp.id, retakeNote: { not: null } },
        });
        if (stillFlagged === 0) {
          await tx.stylingBlueprint.update({
            where: { id: bp.id },
            data: { status: "under_review" },
          });
          status = "under_review";
        }
      }
      return {
        photo: created,
        replacedPaths: previous.map((p) => p.document.fileUrl),
        retakeAnswered: answered,
        statusAfter: status,
      };
    });
  } catch (e) {
    await deleteObjects([path]);
    throw e;
  }
  const { photo, replacedPaths, retakeAnswered, statusAfter } = result;

  await deleteObjects(replacedPaths);

  // The stylist hears about changes while the Blueprint is in their hands.
  if (access.isOwner && (bp.status === "under_review" || bp.status === "retake_requested")) {
    const stylists = await stylistUserIds(clientId);
    const recipients = stylists.length ? stylists : await getAdminUserIds();
    const label = PHOTO_SLOT_LABELS[slot as StylingPhotoSlot].toLowerCase();
    await notifyUsers(recipients, {
      type: retakeAnswered ? "styling_retake_received" : "styling_photo_updated",
      title: retakeAnswered
        ? `${access.clientName} sent the retake`
        : `${access.clientName} updated a photo`,
      body: retakeAnswered
        ? `The new ${label} photo is in. ${statusAfter === "under_review" ? "All retakes are done." : ""}`.trim()
        : `A new ${label} photo was added to the Styling Blueprint.`,
      linkPath: staffBlueprintLink(clientId),
    });
  }

  let url: string | null = null;
  try {
    url = await createSignedUrl(path);
  } catch {
    url = null;
  }
  return json(req, {
    photo: { id: photo.id, slot: photo.slot, url, retakeNote: null },
    status: statusAfter,
  });
}

export const POST = withRequestLog(handlePost);
