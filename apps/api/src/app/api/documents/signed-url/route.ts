import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { createSignedUrl } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Mint a short-lived signed URL for a stored document, mirroring the Document
 * read policy and SRS §16.1's visibility matrix:
 *   - admins see everything;
 *   - the owning client sees their own docs except consultation_notes;
 *   - assigned staff see docs except payment_proof (CRO/Ops/Founder only) and
 *     expense_receipt (Ops/Founder only).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let documentId: string | undefined;
  try {
    ({ documentId } = (await req.json()) as { documentId?: string });
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!documentId) return json(req, { error: "documentId is required" }, 400);

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      fileUrl: true,
      type: true,
      client: {
        select: {
          userId: true,
          assignments: {
            where: { staffId: authUser.id, isActive: true },
            select: { id: true },
          },
        },
      },
    },
  });
  if (!doc) return json(req, { error: "Document not found" }, 404);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  const isAssigned = doc.client.assignments.length > 0;
  const isOwner = doc.client.userId === authUser.id;

  // SEC-10: the same matrix the schema enforces for reads — a signed URL must
  // never out-permit the row-level read policy.
  const financialRestricted =
    (doc.type === "payment_proof" && authUser.role !== "cro") ||
    doc.type === "expense_receipt";
  const visibleToOwner = isOwner && doc.type !== "consultation_notes";
  const visibleToStaff = isAssigned && !financialRestricted;
  if (!isAdmin && !visibleToOwner && !visibleToStaff) {
    return json(req, { error: "Forbidden" }, 403);
  }

  try {
    const url = await createSignedUrl(doc.fileUrl);
    return json(req, { url });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Could not sign URL" }, 502);
  }
}
