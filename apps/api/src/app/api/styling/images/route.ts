import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { createSignedUrl, deleteObjects, uploadObject } from "@/lib/storage";
import { IMAGE_MIME, readUpload } from "@/lib/uploads";
import { canWorkBlueprint, stylingAccess } from "@/lib/styling";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Stylist uploads an image for the Blueprint: an edited photo of the client
 * (hairstyle, beard, outfit try-on) or a product shot. Stored as a
 * styling_image Document, which the client only ever sees once a published
 * Blueprint references it.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role === "client") return json(req, { error: "Forbidden" }, 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }
  const clientId = form.get("clientId");
  if (typeof clientId !== "string" || !clientId)
    return json(req, { error: "clientId is required" }, 400);

  const access = await stylingAccess(user, clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!canWorkBlueprint(access)) return json(req, { error: "Forbidden" }, 403);
  if (access.archived) return json(req, { error: "This programme has ended" }, 409);

  const upload = await readUpload(form, IMAGE_MIME);
  if (!upload.ok) return json(req, { error: upload.error }, upload.status);
  const { file } = upload;

  const path = `${clientId}/styling_image/${crypto.randomUUID()}-${file.safeName}`;
  const { error } = await uploadObject(path, file.buffer, file.mime);
  if (error) {
    requestLog(req).error("styling image upload failed", { path, reason: error.message });
    return json(req, { error: "Upload failed. Please try again." }, 502);
  }
  let document;
  try {
    document = await prisma.document.create({
      data: {
        clientId,
        type: "styling_image",
        fileName: file.name,
        fileUrl: path,
        fileSize: file.size,
        uploadedById: user.id,
      },
      select: { id: true, fileName: true, createdAt: true },
    });
  } catch (e) {
    await deleteObjects([path]);
    throw e;
  }
  let url: string | null = null;
  try {
    url = await createSignedUrl(path);
  } catch {
    url = null;
  }
  return json(req, { document, url });
}

export const POST = withRequestLog(handlePost);
