import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { assessmentAccess, clientCanEdit, ownClientId, skinPhotoViews } from "@/lib/assessment";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * The Pre-Consultation Assessment with signed skin-photo URLs. The client
 * reads their own (to fill or resume the form); staff pass ?clientId= and
 * need the assessment viewer access (admins, assigned CRO / skincare /
 * fitness).
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId =
    user.role === "client" ? await ownClientId(user) : req.nextUrl.searchParams.get("clientId");
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await assessmentAccess(user, clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!access.canView) return json(req, { error: "Forbidden" }, 403);

  const [assessment, photos, editable] = await Promise.all([
    prisma.assessment.findUnique({ where: { clientId } }),
    skinPhotoViews(clientId),
    clientCanEdit(clientId),
  ]);
  return json(req, { assessment, photos, editable });
}

export const GET = withRequestLog(handleGet);
