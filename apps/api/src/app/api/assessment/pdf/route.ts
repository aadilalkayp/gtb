import type { NextRequest } from "next/server";
import { recordActivityEvent } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { assessmentAccess } from "@/lib/assessment";
import { buildAssessmentPdf } from "@/lib/assessmentPdf";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * The Pre-Consultation Assessment PDF (spec §10), rendered on demand from the
 * stored answers so it always shows the current consultants and package.
 * Internal: staff with assessment access only, never the client.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await assessmentAccess(user, clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (access.isOwner || !access.canView) return json(req, { error: "Forbidden" }, 403);

  const pdf = await buildAssessmentPdf(clientId);
  if (!pdf) return json(req, { error: "The assessment hasn't been submitted yet" }, 404);

  await recordActivityEvent({
    actor: user,
    verb: "document.downloaded",
    kind: "view",
    entityType: "Assessment",
    entityId: clientId,
    clientId,
    module: "documents",
    meta: { type: "pre_consultation_assessment", fileName: pdf.fileName },
  }).catch((error) => requestLog(req).error("assessment pdf view not recorded", { error }));

  return new Response(new Uint8Array(pdf.buffer), {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
      "Access-Control-Expose-Headers": "Content-Disposition",
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withRequestLog(handleGet);
