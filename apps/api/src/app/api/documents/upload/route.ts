import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { DOCUMENT_TYPES, type DocumentType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { uploadObject } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (SRS §16.2)

// SRS §16.2: supported formats are JPEG, PNG, PDF, DOCX. (webp/heic removed —
// they were not in the SRS list.)
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Magic-byte sniffing: `file.type` is client-controlled and must not be
// trusted. The declared MIME must match the actual file content.
const MAGIC_BYTES: { mime: string; signature: number[] }[] = [
  { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46] },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: [0x50, 0x4b, 0x03, 0x04] }, // DOCX (zip container)
];

function sniffMime(buffer: Buffer): string | undefined {
  for (const { mime, signature } of MAGIC_BYTES) {
    if (signature.every((b, i) => buffer[i] === b)) return mime;
  }
  return undefined;
}

// Who may upload each document type (SRS §16.1 "Uploaded By", applied to the
// gateway + upload route). "client" = the owning client; "client_or_staff" =
// owning client or any staff; "staff" = any non-client role; "system" = no UI
// uploader (generated server-side, e.g. PDF receipts / assessment forms).
// Admins (founder / ops_head) may upload anything.
const UPLOADER_BY_TYPE: Record<DocumentType, "client" | "client_or_staff" | "staff" | Set<string> | "system"> = {
  assessment_form: "system",
  skincare_plan: new Set(["skincare_consultant"]),
  fitness_plan: new Set(["fitness_trainer"]),
  styling_guide: new Set(["styling_consultant"]),
  consultation_notes: new Set(["skincare_consultant", "fitness_trainer", "styling_consultant"]),
  payment_proof: "client", // §16.1: uploaded by the client; admins may help
  payment_receipt: "system",
  expense_receipt: "staff",
  client_photo: "client_or_staff", // §16.1: client or staff
};

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
 * Upload a client document (SRS §13 + §16). Stores the file in private Supabase
 * Storage with the service-role key (no bucket RLS needed) and records a
 * Document row — the ONLY place Document rows are created (the gateway exposes
 * no Document create, SEC-5).
 *
 * SEC-12: the document type must be one the caller's role may upload; sessionId
 * (when given) must belong to the same client; the file's magic bytes must
 * match its declared MIME.
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

  // Authorize the caller against the client: the owning client, an admin, or an
  // actively-assigned staffer.
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, userId: true },
  });
  if (!client) return json(req, { error: "Client not found" }, 404);

  const isOwner = client.userId === authUser.id;
  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  const isStaff = authUser.role !== "client";
  let authorized = isOwner || isAdmin;
  if (!authorized && isStaff) {
    const assignment = await prisma.assignment.findFirst({
      where: { clientId: client.id, staffId: authUser.id, isActive: true },
      select: { id: true },
    });
    authorized = Boolean(assignment);
  }
  if (!authorized) return json(req, { error: "Forbidden" }, 403);

  // SEC-12: type-by-role allowlist (SRS §16.1).
  const uploader = UPLOADER_BY_TYPE[type as DocumentType];
  let typeAllowed: boolean;
  if (uploader === "system") {
    typeAllowed = false; // only server-side generation (e.g. PDF receipts)
  } else if (uploader === "client") {
    typeAllowed = isOwner || isAdmin;
  } else if (uploader === "client_or_staff") {
    typeAllowed = isOwner || isStaff;
  } else if (uploader === "staff") {
    typeAllowed = isStaff && !isOwner;
  } else {
    typeAllowed = isAdmin || (isStaff && uploader.has(authUser.role));
  }
  if (!typeAllowed) {
    return json(req, { error: "Your role can't upload this document type" }, 403);
  }

  // SEC-12: sessionId must exist and belong to the same client.
  if (typeof sessionId === "string" && sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { clientId: true },
    });
    if (!session || session.clientId !== client.id) {
      return json(req, { error: "sessionId does not belong to this client" }, 400);
    }
  }

  // SEC-12: verify declared MIME against the content's magic bytes.
  const declaredType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(declaredType)) {
    return json(req, { error: "Only JPEG, PNG, PDF and DOCX files are allowed" }, 415);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== declaredType) {
    return json(req, { error: "File content does not match its declared type" }, 415);
  }

  const fileName = slugifyName(file.name || "upload");
  const path = `${client.id}/${type}/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await uploadObject(path, buffer, declaredType);
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
