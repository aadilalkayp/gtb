import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.js";

/**
 * Mailgun SMTP mailer.
 *
 * Email is best-effort: if SMTP credentials are not configured (local dev, fresh
 * checkout) we skip sending and report `sent: false` so callers can fall back to
 * surfacing the link in the UI instead of failing the request.
 */

let transporter: Transporter | null = null;

/** True once Mailgun SMTP credentials are present. */
export const mailConfigured = Boolean(env.mailgun.user && env.mailgun.password);

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mailgun.host,
      port: env.mailgun.port,
      secure: env.mailgun.port === 465,
      auth: { user: env.mailgun.user, pass: env.mailgun.password },
    });
  }
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  sent: boolean;
  error?: string;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!mailConfigured) {
    console.warn(
      `[GTB OS] Mail not configured — skipping email to ${input.to} ("${input.subject}")`,
    );
    return { sent: false, error: "mail_not_configured" };
  }
  try {
    await getTransporter().sendMail({
      from: env.mailgun.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "send_failed";
    console.error(`[GTB OS] Failed to send email to ${input.to}:`, error);
    return { sent: false, error };
  }
}
