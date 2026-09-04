import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { applySelfReport, buildScanReport, clientIp, rateLimit } from "@/lib/scan";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Save the short self-assessment (fitness habits + confidence Likerts) on a
 * scan and derive its Fitness and Confidence scores — the two Groom Score
 * inputs a photo can't honestly provide.
 *
 * Access mirrors the report: a scanId is a bearer secret for the funnel lead
 * who owns it (unclaimed or claimed), and a logged-in client may only annotate
 * their own scans. Answers are validated + clamped server-side.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  if (!rateLimit(`selfreport:${clientIp(req)}`, 60)) {
    return json(req, { error: "Too many requests" }, 429);
  }

  let body: { scanId?: string; answers?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.scanId) return json(req, { error: "scanId is required" }, 400);

  const scan = await prisma.scan.findUnique({
    where: { id: body.scanId },
    include: { client: { select: { userId: true, weddingDate: true } } },
  });
  if (!scan) return json(req, { error: "Scan not found" }, 404);
  if (scan.status !== "scored") return json(req, { error: "This scan has no result yet" }, 409);

  // A logged-in user may only touch their own scans (a scanId alone is enough
  // for anonymous funnel traffic, exactly like /api/scan/report).
  const authUser = await resolveAuthUser(req).catch(() => undefined);
  if (authUser && scan.client?.userId && scan.client.userId !== authUser.id) {
    const isAdmin = authUser.role === "founder" || authUser.role === "ops_head";
    if (!isAdmin) return json(req, { error: "Forbidden" }, 403);
  }

  const updated = await applySelfReport(scan.id, body.answers);
  return json(req, { ok: true, report: await buildScanReport(updated, scan.client?.weddingDate) });
}

export const POST = withRequestLog(handlePost);
