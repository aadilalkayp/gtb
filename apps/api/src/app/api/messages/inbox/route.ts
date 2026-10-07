import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { CHAT_KINDS, CONVERSATION_KINDS, isReplyOverdue } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { unreadCounts } from "@/lib/chat";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * The caller's conversations with unread counts. Staff: every conversation on
 * a channel they answer for their assigned clients (admins: all, read-only).
 * Clients: their own conversations. Powers the Messages page and nav badges.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const isAdmin = user.role === "founder" || user.role === "ops_head";

  const where =
    user.role === "client"
      ? { client: { userId: user.id } }
      : isAdmin
        ? {}
        : {
            OR: CONVERSATION_KINDS.map((kind) => ({
              kind,
              client: {
                assignments: {
                  some: { staffId: user.id, isActive: true, role: CHAT_KINDS[kind].staffRole },
                },
              },
            })),
          };

  const conversations = await prisma.conversation.findMany({
    where: { ...where, lastMessageAt: { not: null } },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      lastMessageAt: true,
      lastSenderIsClient: true,
      client: { select: { id: true, name: true, clientCode: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, documentId: true, sender: { select: { name: true } } },
      },
    },
  });
  const unread = await unreadCounts(
    user.id,
    conversations.map((c) => c.id),
  );
  const rows = conversations.map((c) => ({
    id: c.id,
    kind: c.kind,
    client: c.client,
    lastMessageAt: c.lastMessageAt,
    lastSenderIsClient: c.lastSenderIsClient,
    replyOverdue: isReplyOverdue(c),
    preview: c.messages[0]
      ? {
          sender: c.messages[0].sender.name,
          body: c.messages[0].body || (c.messages[0].documentId ? "Sent an attachment" : ""),
        }
      : null,
    // Admins read for oversight; their own unread count is not meaningful.
    unread: isAdmin ? 0 : (unread.get(c.id) ?? 0),
  }));
  return json(req, { conversations: rows, totalUnread: rows.reduce((t, r) => t + r.unread, 0) });
}

export const GET = withRequestLog(handleGet);
