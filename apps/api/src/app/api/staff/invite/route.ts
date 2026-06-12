import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import { staffInviteEmail } from "@/lib/emails";
import { env } from "@/lib/env";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Create + invite a staff member (SRS §22.1). Founder only. Creates the User row
 * (linked by email on first login) and emails a set-password link. Also used to
 * resend an invite for an existing staff member who hasn't logged in yet.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role !== "founder") return json(req, { error: "Forbidden" }, 403);

  let body: { name?: string; email?: string; phone?: string; role?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role as StaffRole | undefined;
  if (!name || !email) return json(req, { error: "name and email are required" }, 400);
  if (!role || !STAFF_ROLES.includes(role)) {
    return json(req, { error: "A valid staff role is required" }, 400);
  }

  // Create or reuse the User row (resend keeps the existing account).
  let user = await prisma.user.findUnique({ where: { email } });
  if (user && user.role === "client") {
    return json(req, { error: "This email belongs to a client account" }, 409);
  }
  if (!user) {
    user = await prisma.user.create({
      data: { name, email, phone: body.phone?.trim() || null, role },
    });
  }

  const redirectTo = `${env.webPublicUrl}/portal/register`;
  let registrationUrl = `${env.webPublicUrl}/login`;
  let warning: string | undefined;
  try {
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
    registrationUrl = link.data.properties?.action_link ?? registrationUrl;
  } catch (e) {
    warning = e instanceof Error ? e.message : "Could not generate a verification link.";
    console.error("[GTB OS] staff generateLink failed:", warning);
  }

  const mail = await sendMail(
    staffInviteEmail({
      to: email,
      staffName: name,
      roleLabel: STAFF_ROLE_LABELS[role],
      registrationUrl,
    }),
  );

  return json(req, {
    ok: true,
    userId: user.id,
    emailed: mail.sent,
    registrationUrl,
    ...(warning ? { warning } : {}),
  });
}
