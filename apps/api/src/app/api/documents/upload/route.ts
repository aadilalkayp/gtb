import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { DOCUMENT_TYPES, isVersionedPlanType, type DocumentType } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { deleteObjects, uploadObject } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";
import { DOCUMENT_MIME, MAX_UPLOAD_BYTES, slugifyName, sniffMime } from "@/lib/uploads";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

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
  progress_photo: "client_or_staff", // fitness progress photos: client or trainer
  // Diet plan PDF, uploaded as part of creating a fitness plan: same people who
  // may create the plan (admins + the client's assigned fitness trainer).
  nutrition_plan: new Set(["fitness_trainer"]),
  // Styling photos and stylist edits have their own routes (/api/styling/*),
  // which also create the Blueprint rows that reference them.
  styling_photo: "system",
  styling_image: "system",
  chat_attachment: "system", // sent with a message (/api/messages)
  skin_photo: "system", // pre-consultation assessment (/api/assessment/photos)
};

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
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
async function handlePost(req: NextRequest): Promise<Response> {
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
  const fitnessPlanId = form.get("fitnessPlanId");
  const rawDescription = form.get("description");
  const description =
    typeof rawDescription === "string" && rawDescription.trim()
      ? rawDescription.trim().slice(0, 300)
      : undefined;

  if (typeof clientId !== "string" || typeof type !== "string") {
    return json(req, { error: "clientId and type are required" }, 400);
  }
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) {
    return json(req, { error: "Invalid document type" }, 400);
  }
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return json(req, { error: "file is required" }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
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

  // A nutrition plan always belongs to a fitness plan of the same client; no
  // other type may carry a plan link.
  const planId = typeof fitnessPlanId === "string" && fitnessPlanId ? fitnessPlanId : undefined;
  if (type === "nutrition_plan") {
    if (!planId) return json(req, { error: "fitnessPlanId is required for a nutrition plan" }, 400);
    const plan = await prisma.fitnessPlan.findUnique({
      where: { id: planId },
      select: { clientId: true },
    });
    if (!plan || plan.clientId !== client.id) {
      return json(req, { error: "fitnessPlanId does not belong to this client" }, 400);
    }
  } else if (planId) {
    return json(req, { error: "fitnessPlanId is only valid for a nutrition plan" }, 400);
  }

  // SEC-12: verify declared MIME against the content's magic bytes.
  const declaredType = file.type || "application/octet-stream";
  if (!DOCUMENT_MIME.has(declaredType)) {
    return json(req, { error: "Only JPEG, PNG, PDF and DOCX files are allowed" }, 415);
  }
  // Consultation plans are delivered as PDFs (pre-consultation spec §12).
  if (isVersionedPlanType(type) && declaredType !== "application/pdf") {
    return json(req, { error: "Plans must be uploaded as a PDF" }, 415);
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
    requestLog(req).error("document storage upload failed", { path, reason: uploadError.message });
    return json(req, { error: "Upload failed. Please try again." }, 502);
  }

  // Plan PDFs are versioned: a new upload becomes the active version and the
  // previous one is kept as superseded history (spec §12; diet plans included,
  // one series per fitness plan). Other documents are stored as-is.
  let document;
  try {
    document = await prisma.$transaction(async (tx) => {
      let version: number | undefined;
      if (isVersionedPlanType(type)) {
        const series = {
          clientId: client.id,
          type: type as DocumentType,
          ...(type === "nutrition_plan" ? { fitnessPlanId: planId } : {}),
        };
        // Serialise concurrent uploads to the same series so versions stay unique.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`doc-version:${client.id}:${type}:${planId ?? ""}`}))`;
        const latest = await tx.document.aggregate({ where: series, _max: { version: true } });
        version = (latest._max.version ?? 0) + 1;
        await tx.document.updateMany({
          where: { ...series, status: "active" },
          data: { status: "superseded" },
        });
      }
      return tx.document.create({
        data: {
          clientId: client.id,
          type: type as DocumentType,
          fileName: file.name || fileName,
          fileUrl: path, // storage object path; resolved to a signed URL when viewed
          fileSize: file.size,
          uploadedById: authUser.id,
          sessionId: typeof sessionId === "string" && sessionId ? sessionId : undefined,
          fitnessPlanId: planId,
          version,
          description,
        },
      });
    });
  } catch (e) {
    await deleteObjects([path]);
    throw e;
  }

  return json(req, { document });
}

export const POST = withRequestLog(handlePost);
