import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { SKIN_PHOTO_ANGLES, SKIN_PHOTO_ANGLE_LABELS, type SkinPhotoAngle } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { deleteObjects, uploadObject } from "@/lib/storage";
import { IMAGE_MIME, readUpload } from "@/lib/uploads";
import { assessmentAccess, clientCanEdit, ownClientId, skinPhotoViews } from "@/lib/assessment";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const PREVIEW_MIME = new Set(["image/jpeg"]);

function isAngle(v: unknown): v is SkinPhotoAngle {
  return typeof v === "string" && (SKIN_PHOTO_ANGLES as readonly string[]).includes(v);
}

/** The client (or an admin on their behalf) whose form this is, if editable. */
async function editableClient(
  req: NextRequest,
  formClientId: unknown,
): Promise<{ clientId: string; userId: string } | Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId =
    user.role === "client"
      ? await ownClientId(user)
      : typeof formClientId === "string"
        ? formClientId
        : null;
  if (!clientId) return json(req, { error: "clientId is required" }, 400);
  const access = await assessmentAccess(user, clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!access.isOwner && !access.isAdmin) return json(req, { error: "Forbidden" }, 403);
  if (!(await clientCanEdit(clientId))) {
    return json(
      req,
      { error: "Your assessment has been submitted. Contact your team to make changes." },
      409,
    );
  }
  return { clientId, userId: user.id };
}

/**
 * Upload one skin photo into its angle slot (multipart: angle, file, and an
 * optional `preview`: a downscaled JPEG the browser makes for fast previews
 * and the PDF). The original is stored byte-for-byte. A new upload replaces
 * that angle's previous photo; other angles are never touched.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }
  const angle = form.get("angle");
  if (!isAngle(angle)) {
    return json(req, { error: "angle must be one of " + SKIN_PHOTO_ANGLES.join(", ") }, 400);
  }
  const target = await editableClient(req, form.get("clientId"));
  if (target instanceof Response) return target;
  const { clientId, userId } = target;

  const upload = await readUpload(form, IMAGE_MIME);
  if (!upload.ok) {
    const error =
      upload.status === 415
        ? `${SKIN_PHOTO_ANGLE_LABELS[angle]}: please upload a JPG or PNG photo`
        : upload.error;
    return json(req, { error }, upload.status);
  }
  const { file } = upload;
  // The preview is a convenience: a bad or missing one falls back to the original.
  const preview = form.get("preview") ? await readUpload(form, PREVIEW_MIME, "preview") : null;

  const base = `${clientId}/skin_photo/${crypto.randomUUID()}`;
  const path = `${base}-${file.safeName}`;
  const previewPath = preview?.ok ? `${base}-preview.jpg` : null;
  const { error: storageError } = await uploadObject(path, file.buffer, file.mime);
  if (storageError) {
    requestLog(req).error("skin photo upload failed", { path, reason: storageError.message });
    return json(req, { error: "Upload failed. Please try again." }, 502);
  }
  let storedPreview: string | null = null;
  if (previewPath && preview?.ok) {
    const { error } = await uploadObject(previewPath, preview.file.buffer, "image/jpeg");
    if (error) requestLog(req).warn("skin photo preview upload failed", { reason: error.message });
    else storedPreview = previewPath;
  }

  let replaced: string[] = [];
  try {
    replaced = await prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.upsert({
        where: { clientId },
        create: { clientId },
        update: {},
        select: { id: true },
      });
      const previous = await tx.skinPhoto.findUnique({
        where: { assessmentId_angle: { assessmentId: assessment.id, angle } },
        select: { previewPath: true, document: { select: { id: true, fileUrl: true } } },
      });
      if (previous) {
        // Deleting the Document cascades to its SkinPhoto row.
        await tx.document.delete({ where: { id: previous.document.id } });
      }
      const document = await tx.document.create({
        data: {
          clientId,
          type: "skin_photo",
          fileName: file.name,
          fileUrl: path,
          fileSize: file.size,
          uploadedById: userId,
          description: SKIN_PHOTO_ANGLE_LABELS[angle],
        },
      });
      await tx.skinPhoto.create({
        data: { assessmentId: assessment.id, angle, documentId: document.id, previewPath: storedPreview },
      });
      return previous
        ? [previous.document.fileUrl, ...(previous.previewPath ? [previous.previewPath] : [])]
        : [];
    });
  } catch (e) {
    await deleteObjects([path, ...(storedPreview ? [storedPreview] : [])]);
    throw e;
  }
  await deleteObjects(replaced);

  const photo = (await skinPhotoViews(clientId)).find((p) => p.angle === angle) ?? null;
  return json(req, { photo });
}

/** Remove one angle's photo before submission (?angle=, plus clientId for admins). */
async function handleDelete(req: NextRequest): Promise<Response> {
  const angle = req.nextUrl.searchParams.get("angle");
  if (!isAngle(angle)) {
    return json(req, { error: "angle must be one of " + SKIN_PHOTO_ANGLES.join(", ") }, 400);
  }
  const target = await editableClient(req, req.nextUrl.searchParams.get("clientId"));
  if (target instanceof Response) return target;

  const photo = await prisma.skinPhoto.findFirst({
    where: { angle, assessment: { clientId: target.clientId } },
    select: { previewPath: true, document: { select: { id: true, fileUrl: true } } },
  });
  if (!photo) return json(req, { ok: true });
  await prisma.document.delete({ where: { id: photo.document.id } });
  await deleteObjects([photo.document.fileUrl, ...(photo.previewPath ? [photo.previewPath] : [])]);
  return json(req, { ok: true });
}

export const POST = withRequestLog(handlePost);
export const DELETE = withRequestLog(handleDelete);
