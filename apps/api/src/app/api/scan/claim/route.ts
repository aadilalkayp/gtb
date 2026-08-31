import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { generateClientCode } from "@gtb/shared";
import { buildScanReport, clientIp, rateLimit } from "@/lib/scan";
import { syncRoadmap } from "@/lib/scan";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const CLAIMS_PER_HOUR_PER_IP = 20;
const LEAD_SOURCE_NAME = "Readiness Scan";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Claim an anonymous scan with contact details — the funnel's email gate.
 *
 * Dedup rule (the "funnel, not duplication" crux): the email is matched against
 * existing Clients first. A match ATTACHES the scan to that record — it never
 * creates a duplicate lead, and none of the existing record's fields (status,
 * plan, wedding date…) are exposed to the anonymous caller: the response is
 * built purely from the scan + roadmap. No match creates a fresh lead with
 * LeadSource "Readiness Scan", so funnel performance shows up in the existing
 * CRO tracking and reports with zero new admin surface. The new lead's
 * Assessment is prefilled from the scan's focus areas so consultants inherit a
 * head start at conversion.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  if (!rateLimit(`claim:${clientIp(req)}`, CLAIMS_PER_HOUR_PER_IP)) {
    return json(req, { error: "Too many requests. Try again in an hour." }, 429);
  }

  let body: { scanId?: string; name?: string; email?: string; phone?: string; city?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const scanId = body.scanId?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim();
  const city = body.city?.trim() ?? "";

  if (!scanId) return json(req, { error: "scanId is required" }, 400);
  if (!name) return json(req, { error: "Your name is required" }, 400);
  if (!email || !EMAIL_RE.test(email))
    return json(req, { error: "A valid email is required" }, 400);
  if (!phone) return json(req, { error: "A phone number is required" }, 400);

  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan) return json(req, { error: "Scan not found" }, 404);
  if (scan.status !== "scored")
    return json(req, { error: "This scan has no result to claim" }, 409);

  // Already claimed: idempotent success for the same submission, otherwise
  // refuse — a scanId is a bearer secret, but claiming can't re-point a scan.
  if (scan.clientId) {
    const owner = await prisma.client.findUnique({
      where: { id: scan.clientId },
      select: { email: true, weddingDate: true },
    });
    if (owner && owner.email.toLowerCase() === email) {
      return json(req, { ok: true, report: await buildScanReport(scan, owner.weddingDate) });
    }
    return json(req, { error: "This scan is already linked to an account" }, 409);
  }

  // Dedup by email against ALL existing clients (any status).
  let client = await prisma.client.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, weddingDate: true },
  });

  if (!client) {
    const leadSource =
      (await prisma.leadSource.findFirst({ where: { name: LEAD_SOURCE_NAME } })) ??
      (await prisma.leadSource.create({ data: { name: LEAD_SOURCE_NAME } }));

    // clientCode is random; retry the rare unique collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        client = await prisma.client.create({
          data: {
            clientCode: generateClientCode(scan.type),
            name,
            phone,
            email,
            city,
            type: scan.type,
            weddingDate: scan.weddingDate,
            status: "lead",
            leadSourceId: leadSource.id,
            notes: "Lead from the Transformation Readiness Scan funnel.",
          },
          select: { id: true, weddingDate: true },
        });
        break;
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
    if (!client)
      return json(req, { error: "Could not create your profile. Please try again." }, 500);

    // Prefill the assessment from the scan so consultants start ahead.
    const focus = (scan.focusAreas as { area: string }[] | null) ?? [];
    await prisma.assessment.create({
      data: {
        clientId: client.id,
        skinConcerns: focus.map((f) => f.area).slice(0, 4),
        facePhotoUrl: null,
      },
    });
  }

  const claimed = await prisma.scan.update({
    where: { id: scan.id },
    data: { clientId: client.id },
  });
  await syncRoadmap(client.id, claimed, client.weddingDate);

  return json(req, { ok: true, report: await buildScanReport(claimed, client.weddingDate) });
}

export const POST = withRequestLog(handlePost);
