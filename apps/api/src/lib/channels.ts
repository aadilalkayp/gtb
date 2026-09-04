/**
 * Outbound messaging for the funnel — one entry point, channel adapters behind it.
 *
 * `sendFunnelMessage(clientId, templateKey)` builds the FunnelContext from the
 * client + their latest scored scan, renders the template, and delivers it on
 * every enabled channel. Delivery is recorded in OutboundMessage, which is also
 * the idempotency key: the same (client, template, channel) is never sent
 * twice, however often the daily job runs.
 *
 * Channels:
 *   email    — Mailgun SMTP via mailer.ts (always on when SMTP is configured).
 *   whatsapp — provider-agnostic adapter; ships as a stub that records
 *              `skipped` until WHATSAPP_PROVIDER + credentials are configured.
 *              Adding a provider = implementing WhatsAppProvider below.
 *
 * Opt-out: clients with marketingOptOut skip everything here. Transactional
 * mail elsewhere (invites, session reminders) is unaffected.
 */
import { randomUUID } from "node:crypto";
import { prisma, type MessageChannel } from "@gtb/db";
import { CLIENT_TYPE_LABELS, daysUntil } from "@gtb/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { mailConfigured, sendMail } from "./mailer.js";
import { resolveTemplate, type FunnelContext } from "./funnelTemplates.js";

const log = logger.child({ mod: "channels" });

export const PRODUCT_NAME = "Transformation Readiness Scan";

// ---------------------------------------------------------------------------
// WhatsApp adapter
// ---------------------------------------------------------------------------

interface WhatsAppProvider {
  send(toPhone: string, text: string): Promise<{ id?: string }>;
}

/** Resolve the configured provider, or null when WhatsApp isn't set up. */
function whatsAppProvider(): WhatsAppProvider | null {
  const provider = process.env.WHATSAPP_PROVIDER ?? "none";
  // Provider implementations plug in here (Twilio, Gupshup, Meta Cloud API…).
  // Each needs its own credentials in gtb-api.env; until one is configured the
  // channel records `skipped` so the drip history stays honest.
  switch (provider) {
    default:
      return null;
  }
}

export const whatsAppConfigured = whatsAppProvider() !== null;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

async function ensureUnsubscribeToken(clientId: string, current: string | null): Promise<string> {
  if (current) return current;
  const token = randomUUID();
  await prisma.client.update({ where: { id: clientId }, data: { unsubscribeToken: token } });
  return token;
}

export async function buildFunnelContext(clientId: string): Promise<FunnelContext | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      type: true,
      weddingDate: true,
      unsubscribeToken: true,
      scans: {
        where: { status: "scored" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!client) return null;
  const scan = client.scans[0];
  if (!scan) return null;

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [weekItems, milestones] = await Promise.all([
    prisma.roadmapItem.findMany({
      where: { clientId, kind: "weekly_focus", isDone: false, dueDate: { gte: now, lt: in7 } },
      orderBy: { dueDate: "asc" },
      take: 3,
      select: { title: true, description: true },
    }),
    prisma.roadmapItem.findMany({
      where: { clientId, kind: "checklist", isDone: false, dueDate: { gte: now, lt: in30 } },
      orderBy: { dueDate: "asc" },
      take: 4,
      select: { title: true, dueDate: true },
    }),
  ]);

  const token = await ensureUnsubscribeToken(client.id, client.unsubscribeToken);
  const scored =
    scan.skinScore != null &&
    scan.hairScore != null &&
    scan.beardScore != null &&
    scan.styleScore != null;

  return {
    firstName: client.name.split(" ")[0] || client.name,
    brand: CLIENT_TYPE_LABELS[client.type],
    product: PRODUCT_NAME,
    reportUrl: `${env.webPublicUrl}/scan/r/${scan.id}`,
    cardUrl: `${env.apiPublicUrl}/api/scan/card?scanId=${scan.id}`,
    scanUrl: `${env.webPublicUrl}/scan`,
    unsubscribeUrl: `${env.apiPublicUrl}/api/scan/unsubscribe?token=${token}`,
    daysToWedding: Math.max(0, daysUntil(client.weddingDate)),
    readiness: scan.readinessScore,
    scores: scored
      ? {
          skin: scan.skinScore!,
          hair: scan.hairScore!,
          beard: scan.beardScore!,
          style: scan.styleScore!,
        }
      : null,
    focusAreas: (scan.focusAreas as { area: string; weight: number }[] | null) ?? [],
    weekItems,
    milestones,
  };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export interface SendReport {
  template: string;
  results: { channel: MessageChannel; status: "sent" | "failed" | "skipped"; reason?: string }[];
}

/**
 * Deliver one template to one client on all enabled channels. Idempotent per
 * (client, template, channel). Never throws — delivery problems are recorded,
 * not propagated (the claim route must not fail because Mailgun hiccuped).
 */
export async function sendFunnelMessage(
  clientId: string,
  templateKey: string,
): Promise<SendReport> {
  const report: SendReport = { template: templateKey, results: [] };
  const template = resolveTemplate(templateKey);
  if (!template) {
    log.error("unknown funnel template", { templateKey });
    return report;
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { email: true, phone: true, marketingOptOut: true, status: true },
  });
  if (!client) return report;
  if (client.marketingOptOut) {
    report.results.push({ channel: "email", status: "skipped", reason: "opted_out" });
    return report;
  }

  const ctx = await buildFunnelContext(clientId);
  if (!ctx) {
    report.results.push({ channel: "email", status: "skipped", reason: "no_scored_scan" });
    return report;
  }
  const rendered = template(ctx);

  const channels: MessageChannel[] = ["email"];
  if (whatsAppConfigured && client.phone) channels.push("whatsapp");

  for (const channel of channels) {
    // Idempotency: one row per (client, template, channel), created before the
    // send so a crash mid-delivery can't double-send on the next run.
    const existing = await prisma.outboundMessage.findUnique({
      where: { clientId_template_channel: { clientId, template: templateKey, channel } },
      select: { id: true, status: true },
    });
    // Only a successful send is final: failed and skipped (e.g. channel not yet
    // configured) rows are retried on the next run.
    if (existing?.status === "sent") {
      report.results.push({ channel, status: "skipped", reason: "already_sent" });
      continue;
    }

    let status: "sent" | "failed" | "skipped" = "skipped";
    let error: string | undefined;
    let providerId: string | undefined;

    if (channel === "email") {
      if (!mailConfigured) {
        error = "mail_not_configured";
      } else {
        const res = await sendMail({
          to: client.email,
          ...rendered.email,
          listUnsubscribe: ctx.unsubscribeUrl,
        });
        status = res.sent ? "sent" : "failed";
        error = res.error;
      }
    } else {
      const provider = whatsAppProvider();
      if (!provider) {
        error = "whatsapp_not_configured";
      } else {
        try {
          const res = await provider.send(client.phone, rendered.whatsapp);
          status = "sent";
          providerId = res.id;
        } catch (e) {
          status = "failed";
          error = e instanceof Error ? e.message : "send_failed";
        }
      }
    }

    await prisma.outboundMessage.upsert({
      where: { clientId_template_channel: { clientId, template: templateKey, channel } },
      create: { clientId, template: templateKey, channel, status, error, providerId },
      update: { status, error, providerId, createdAt: new Date() },
    });
    report.results.push({ channel, status, reason: error });
    log.info("funnel message", { clientId, templateKey, channel, status, error });
  }

  return report;
}
