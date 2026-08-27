import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { buildScanReport, clientIp, rateLimit } from "@/lib/scan";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Fetch a scan report by scanId — the anonymous funnel's read path (the id is a
 * random uuid acting as a bearer secret, handed out only to the browser that
 * ran the scan). The payload is built purely from the scan + its roadmap and
 * never exposes fields off an existing Client record. Authenticated portal
 * reads go through the policy-enforced gateway instead.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!rateLimit(`report:${clientIp(req)}`, 120)) {
    return json(req, { error: "Too many requests" }, 429);
  }
  const scanId = req.nextUrl.searchParams.get("scanId");
  if (!scanId) return json(req, { error: "scanId is required" }, 400);

  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan) return json(req, { error: "Scan not found" }, 404);

  const owner = scan.clientId
    ? await prisma.client.findUnique({
        where: { id: scan.clientId },
        select: { weddingDate: true },
      })
    : null;

  return json(req, { report: await buildScanReport(scan, owner?.weddingDate) });
}
