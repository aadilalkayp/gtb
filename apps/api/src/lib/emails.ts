import type { SendMailInput } from "./mailer.js";

/** Minimal branded wrapper so all transactional emails look consistent. */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4">
          <tr><td style="background:#1c1917;padding:20px 28px;color:#fafaf9;font-weight:700;font-size:14px;letter-spacing:.04em">GTB&nbsp;OS</td></tr>
          <tr><td style="padding:28px">
            <h1 style="margin:0 0 16px;font-size:18px">${heading}</h1>
            ${bodyHtml}
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#a8a29e">Groom To Be · Glow To Be</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1c1917;color:#fafaf9;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${label}</a>`;
}

export function inviteEmail(args: {
  to: string;
  clientName: string;
  brand: string; // "Groom To Be" / "Glow To Be"
  registrationUrl: string;
}): SendMailInput {
  const { to, clientName, brand, registrationUrl } = args;
  const subject = `Welcome to ${brand} — finish setting up your account`;
  const html = layout(
    "You're invited to your client portal",
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6">Hi ${clientName},</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6">
      Your <strong>${brand}</strong> journey is ready to begin. Click below to set your
      password and complete a short onboarding assessment so your team can build your plan.
    </p>
    <p style="margin:0 0 22px">${button(registrationUrl, "Set up my account")}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#78716c">
      This link expires in 7 days. If the button doesn't work, copy and paste this URL into your browser:<br>
      <span style="color:#44403c;word-break:break-all">${registrationUrl}</span>
    </p>
  `,
  );
  const text = `Hi ${clientName},

Your ${brand} journey is ready to begin. Set your password and complete your onboarding assessment here:

${registrationUrl}

This link expires in 7 days.

— Groom To Be / Glow To Be`;
  return { to, subject, html, text };
}

export function staffInviteEmail(args: {
  to: string;
  staffName: string;
  roleLabel: string;
  registrationUrl: string;
}): SendMailInput {
  const { to, staffName, roleLabel, registrationUrl } = args;
  const subject = "Your GTB OS account is ready";
  const html = layout(
    "Welcome to the team",
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6">Hi ${staffName},</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6">
      You've been added to <strong>GTB OS</strong> as <strong>${roleLabel}</strong>.
      Set your password to access your dashboard.
    </p>
    <p style="margin:0 0 22px">${button(registrationUrl, "Set my password")}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#78716c">
      If the button doesn't work, copy and paste this URL into your browser:<br>
      <span style="color:#44403c;word-break:break-all">${registrationUrl}</span>
    </p>
  `,
  );
  const text = `Hi ${staffName},

You've been added to GTB OS as ${roleLabel}. Set your password here:

${registrationUrl}

— GTB OS`;
  return { to, subject, html, text };
}
