import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { createScanSignedUrl } from "@/lib/storage";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Mint a signed URL for a scan photo. Authenticated only, mirroring the Scan
 * read policy: admins, staff actively assigned to the client, or the owning
 * client. (Anonymous funnel screens re-show the photo from the browser's own
 * file, so no anonymous read path is needed.)
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);

  let scanId: string | undefined;
  try {
    ({ scanId } = (await req.json()) as { scanId?: string });
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!scanId) return json(req, { error: "scanId is required" }, 400);

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { photoPath: true, clientId: true, client: { select: { userId: true } } },
  });
  if (!scan) return json(req, { error: "Scan not found" }, 404);

  const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
  const isOwner = scan.client?.userId === authUser.id;
  let authorized = isAdmin || isOwner;
  if (!authorized && scan.clientId && authUser.role !== "client") {
    const assignment = await prisma.assignment.findFirst({
      where: { clientId: scan.clientId, staffId: authUser.id, isActive: true },
      select: { id: true },
    });
    authorized = Boolean(assignment);
  }
  if (!authorized) return json(req, { error: "Forbidden" }, 403);

  const url = await createScanSignedUrl(scan.photoPath);
  return json(req, { url });
}

export const POST = withRequestLog(handlePost);
