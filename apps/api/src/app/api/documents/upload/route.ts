import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { DOCUMENT_TYPES, type DocumentType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { uploadObject } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

function slugifyName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "";
  return ext ? `${base || "file"}.${ext}` : base || "file";
}

/**
 * Upload a client document (SRS §13). Stores the file in private Supabase Storage
 * with the service-role key (no bucket RLS needed) and records a Document row.
 * Used by the onboarding wizard for payment proofs and assessment photos.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }

  const file = form.get("file");
  const clientId = form.get("clientId");
  const type = form.get("type");
  const sessionId = form.get("sessionId");

  if (typeof clientId !== "string" || typeof type !== "string") {
    return json(req, { error: "clientId and type are required" }, 400);
  }
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) {
    return json(req, { error: "Invalid document type" }, 400);
  }
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return json(req, { error: "file is required" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json(req, { error: "File is larger than 10 MB" }, 413);
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(contentType)) {
    return json(req, { error: "Only images and PDFs are allowed" }, 415);
  }

  // Authorize: the client themselves, an admin, or an actively-assigned staffer.
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, userId: true },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);

  const isOwner = client.userId === authUser.id;
  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  let allowed = isOwner || isAdmin;
  if (!allowed) {
    const assignment = await prisma.assignment.findFirst({
      where: { clientId: client.id, staffId: authUser.id, isActive: true },
      select: { id: true },
    });
    allowed = Boolean(assignment);
  }
  if (!allowed) return json(req, { error: "Forbidden" }, 403);

  const fileName = slugifyName(file.name || "upload");
  const path = `${client.id}/${type}/${crypto.randomUUID()}-${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await uploadObject(path, buffer, contentType);
  if (uploadError) {
    console.error("[GTB OS] Storage upload failed:", uploadError.message);
    return json(req, { error: "Upload failed. Please try again." }, 502);
  }

  const document = await prisma.document.create({
    data: {
      clientId: client.id,
      type: type as DocumentType,
      fileName: file.name || fileName,
      fileUrl: path, // storage object path; resolved to a signed URL when viewed
      fileSize: file.size,
      uploadedById: authUser.id,
      sessionId: typeof sessionId === "string" && sessionId ? sessionId : undefined,
    },
  });

  return json(req, { document });
}
