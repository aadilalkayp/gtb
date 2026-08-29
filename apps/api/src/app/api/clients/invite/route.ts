import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { CLIENT_TYPE_LABELS, LEAD_PHASE_ORDER } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sendMail, mailConfigured } from "@/lib/mailer";
import { inviteEmail } from "@/lib/emails";
import { env } from "@/lib/env";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const INVITER_ROLES = new Set(["founder", "ops_head", "cro"]);
const REGISTER_PATH = "/portal/register";

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Invite a lead to register (SRS §4.2 / §6.1 steps 2–3).
 *
 * Provisions the client's User row (linked on first login by email), assigns the
 * inviting staff member as the client's CRO, advances the lead phase, then emails
 * a Supabase-backed registration link. Email is best-effort — the link is always
 * returned so the staff UI can show/copy it when SMTP isn't configured.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!INVITER_ROLES.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let clientId: string | undefined;
  try {
    ({ clientId } = (await req.json()) as { clientId?: string });
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return json(req, { error: "Client not found" }, 404);
  if (client.status !== "lead") {
    return json(req, { error: "Only leads can be invited" }, 409);
  }

  const email = client.email.toLowerCase();

  // 1. Ensure a client User row exists and is linked to the Client.
  let userId = client.userId;
  if (!userId) {
    const existing = await prisma.user.findUnique({ where: { email } });
    // SEC-8: never link a client record to a staff (or other-role) account —
    // that would hand the staffer every client-ownership check.
    if (existing && existing.role !== "client") {
      return json(
        req,
        { error: "This email belongs to a staff account — invite it as a client separately" },
        409,
      );
    }
    const user =
      existing ??
      (await prisma.user.create({
        data: { email, name: client.name, phone: client.phone, role: "client" },
      }));
    userId = user.id;
    await prisma.client.update({ where: { id: client.id }, data: { userId } });
  }

  // 2. Assign the inviter as the client's CRO if no active CRO is assigned yet.
  const activeCro = await prisma.assignment.findFirst({
    where: { clientId: client.id, role: "cro", isActive: true },
  });
  if (!activeCro) {
    await prisma.assignment.create({
      data: {
        clientId: client.id,
        staffId: authUser.id,
        role: "cro",
        assignedById: authUser.id,
      },
    });
  }

  // 3. Advance the lead phase to "invited" (never regress).
  if (LEAD_PHASE_ORDER[client.leadPhase] < LEAD_PHASE_ORDER.invited) {
    await prisma.client.update({
      where: { id: client.id },
      data: { leadPhase: "invited" },
    });
  }

  // 4. Generate a registration link via Supabase, then email it.
  const redirectTo = `${env.webPublicUrl}${REGISTER_PATH}`;
  let registrationUrl = `${redirectTo}?email=${encodeURIComponent(email)}`;
  let warning: string | undefined;

  try {
    // `invite` for a brand-new auth user; fall back to `magiclink` on re-invite
    // (the email already has a Supabase auth account).
    let link = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (link.error) {
      link = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
    }
    if (link.error) throw new Error(link.error.message);
    const actionLink = link.data.properties?.action_link;
    if (actionLink) registrationUrl = actionLink;
    else warning = "Could not generate a verification link; sent a fallback URL.";
  } catch (e) {
    warning = e instanceof Error ? e.message : "Could not generate a verification link.";
    requestLog(req).error("client invite generateLink failed", { error: e });
  }

  const brand = CLIENT_TYPE_LABELS[client.type];
  const mail = await sendMail(
    inviteEmail({ to: client.email, clientName: client.name, brand, registrationUrl }),
  );

  // SEC-9: an invitation link authenticates as the invitee. In normal
  // operation the link goes only by email; it is returned in the API response
  // solely as a dev fallback when mail is not configured (a logged-in CRO must
  // never be able to copy a magic link that logs them in as the client).
  const linkInResponse = !mailConfigured;

  return json(req, {
    ok: true,
    emailed: mail.sent,
    ...(linkInResponse ? { registrationUrl } : {}),
    ...(!linkInResponse ? { emailedHint: "Registration link sent by email" } : {}),
    ...(warning ? { warning } : {}),
    ...(mail.error && mail.error !== "mail_not_configured" ? { mailError: mail.error } : {}),
  });
}

export const POST = withRequestLog(handlePost);
