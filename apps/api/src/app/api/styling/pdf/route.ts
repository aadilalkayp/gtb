import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { canWorkBlueprint, latestVersion, stylingAccess } from "@/lib/styling";
import { generateBlueprintPdf } from "@/lib/stylingPdf";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Regenerate the PDF of the current published version (e.g. after a failed first attempt). */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role === "client") return json(req, { error: "Forbidden" }, 403);
  const body = await readJson<{ clientId: string }>(req);
  if (!body?.clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await stylingAccess(user, body.clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!canWorkBlueprint(access)) return json(req, { error: "Forbidden" }, 403);

  const bp = await prisma.stylingBlueprint.findUnique({
    where: { clientId: access.clientId },
    select: { id: true },
  });
  const version = bp ? await latestVersion(bp.id) : null;
  if (!version) return json(req, { error: "Nothing is published yet" }, 404);

  const pdfDocumentId = await generateBlueprintPdf(version.id, user.id);
  if (!pdfDocumentId)
    return json(req, { error: "The PDF could not be created. Try again in a minute." }, 502);
  return json(req, { ok: true, pdfDocumentId });
}

export const POST = withRequestLog(handlePost);
