/**
 * Hourly chat job (/api/cron/hourly): a staff message the client hasn't read
 * within 12 hours is emailed to them, once. One email per conversation per
 * run covers every message waiting. Failures are logged and never retried:
 * the message is marked as alerted either way (GTB: fail silently), so a
 * mail outage can't turn into a burst of stale emails later.
 */
import { prisma } from "@gtb/db";
import { CHAT_EMAIL_AFTER_HOURS, CHAT_KINDS, type ConversationKind } from "@gtb/shared";
import { chatUnreadEmail } from "./emails.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { sendMail } from "./mailer.js";

const log = logger.child({ mod: "chatJobs" });
const HOUR = 60 * 60 * 1000;
/** Older unread messages are not chased (keeps the scan small). */
const LOOKBACK_DAYS = 7;

export interface ChatJobReport {
  chatEmailsSent: number;
  chatEmailsFailed: number;
}

export async function runChatEmailAlerts(now = new Date()): Promise<ChatJobReport> {
  const report: ChatJobReport = { chatEmailsSent: 0, chatEmailsFailed: 0 };
  const due = await prisma.message.findMany({
    where: {
      emailAlertedAt: null,
      createdAt: {
        lte: new Date(now.getTime() - CHAT_EMAIL_AFTER_HOURS * HOUR),
        gte: new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR),
      },
      conversation: {
        client: { userId: { not: null }, status: { notIn: ["completed", "cancelled"] } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      body: true,
      createdAt: true,
      senderId: true,
      sender: { select: { name: true } },
      conversation: {
        select: {
          id: true,
          kind: true,
          client: { select: { name: true, email: true, userId: true } },
          reads: { select: { userId: true, lastReadAt: true } },
        },
      },
    },
  });

  // Only staff -> client messages the client hasn't read yet.
  const byConversation = new Map<string, typeof due>();
  const readAlready: string[] = [];
  for (const m of due) {
    const clientUserId = m.conversation.client.userId;
    if (!clientUserId || m.senderId === clientUserId) {
      readAlready.push(m.id); // client's own message: nothing to alert
      continue;
    }
    const read = m.conversation.reads.find((r) => r.userId === clientUserId);
    if (read && read.lastReadAt >= m.createdAt) {
      readAlready.push(m.id);
      continue;
    }
    const list = byConversation.get(m.conversation.id) ?? [];
    list.push(m);
    byConversation.set(m.conversation.id, list);
  }
  // Settle the rest so the next run doesn't look at them again.
  if (readAlready.length) {
    await prisma.message.updateMany({
      where: { id: { in: readAlready } },
      data: { emailAlertedAt: now },
    });
  }

  for (const msgs of byConversation.values()) {
    const first = msgs[0]!;
    const latest = msgs[msgs.length - 1]!;
    const client = first.conversation.client;
    const kind = first.conversation.kind as ConversationKind;
    try {
      const result = await sendMail(
        chatUnreadEmail({
          to: client.email,
          clientName: client.name.split(" ")[0] ?? client.name,
          staffName: latest.sender.name.split(" ")[0] ?? latest.sender.name,
          count: msgs.length,
          preview: (latest.body || "Sent you an attachment").slice(0, 200),
          portalUrl: `${env.webPublicUrl}${CHAT_KINDS[kind].portalPath}`,
        }),
      );
      if (result.sent) report.chatEmailsSent += 1;
      else report.chatEmailsFailed += 1;
    } catch (error) {
      report.chatEmailsFailed += 1;
      log.warn("chat unread email failed", { conversationId: first.conversation.id, error });
    }
    await prisma.message.updateMany({
      where: { id: { in: msgs.map((m) => m.id) } },
      data: { emailAlertedAt: now },
    });
  }
  return report;
}
