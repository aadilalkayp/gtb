import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { env } from "@/lib/env";
import { withRequestLog } from "@/lib/handler";

/**
 * One-click unsubscribe from funnel messages (report drips, rescan nudges).
 * The token is a per-client random UUID minted by channels.ts and only ever
 * shipped inside the client's own emails — possession is authorization.
 *
 * GET renders a tiny confirmation page (what a human clicks from the email
 * footer); POST is the RFC 8058 List-Unsubscribe=One-Click endpoint mail
 * clients call. Both are idempotent. Opting out never touches transactional
 * mail (invites, session reminders).
 */
async function optOut(token: string | null): Promise<boolean> {
  if (!token) return false;
  const res = await prisma.client.updateMany({
    where: { unsubscribeToken: token },
    data: { marketingOptOut: true },
  });
  return res.count > 0;
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#fafcfb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#182420;display:flex;min-height:100vh;align-items:center;justify-content:center}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#41504c;font-size:.95rem;line-height:1.6;margin:0 0 1rem}a{color:#0b7e70}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="${env.webPublicUrl}/scan">Back to ${"Transformation Readiness Scan"}</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleGet(req: NextRequest): Promise<Response> {
  const ok = await optOut(req.nextUrl.searchParams.get("token"));
  return ok
    ? page(
        "You're unsubscribed",
        "You won't get any more readiness emails from us. Your report link keeps working, and rescanning any time is still free.",
      )
    : page(
        "Link not recognised",
        "This unsubscribe link isn't valid. If you'd like to stop receiving emails, reply to any message from us and we'll take care of it.",
        404,
      );
}

async function handlePost(req: NextRequest): Promise<Response> {
  const ok = await optOut(req.nextUrl.searchParams.get("token"));
  return new Response(null, { status: ok ? 200 : 404 });
}

export const GET = withRequestLog(handleGet);
export const POST = withRequestLog(handlePost);
