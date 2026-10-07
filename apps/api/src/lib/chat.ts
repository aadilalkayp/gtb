/**
 * Staff <-> client chat helpers (packages/shared/src/chat.ts for the kinds).
 *
 * Who may do what in a conversation of kind K for client C:
 *   - the client (C's own login): read; send once a K staffer is assigned
 *   - C's active K staffer (e.g. styling consultant): read and send
 *   - founder / ops_head: read every conversation, never send
 * Everything turns read-only when the client's programme ends.
 */
import { Prisma, prisma, type AuthUser } from "@gtb/db";
import { CHAT_KINDS, isBlueprintArchived, type ConversationKind } from "@gtb/shared";
import { createSignedUrls } from "./storage.js";

export interface ChatAccess {
  clientId: string;
  clientName: string;
  clientCode: string;
  clientEmail: string;
  clientUserId: string | null;
  isClient: boolean;
  isAdmin: boolean;
  /** The caller holds the channel's assignment. */
  isStaff: boolean;
  canRead: boolean;
  canSend: boolean;
  /** Why sending is off, for the composer. */
  readOnlyReason: string | null;
  /** Current staffer(s) on the channel. */
  staff: { id: string; name: string; avatarUrl: string | null }[];
}

export async function chatAccess(
  user: AuthUser,
  clientId: string,
  kind: ConversationKind,
): Promise<ChatAccess | null> {
  const role = CHAT_KINDS[kind].staffRole;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      clientCode: true,
      email: true,
      status: true,
      type: true,
      userId: true,
      assignments: {
        where: { isActive: true, role },
        select: { staff: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
  if (!client) return null;
  const staff = client.assignments.map((a) => a.staff);
  const isClient = user.role === "client" && client.userId === user.id;
  const isAdmin = user.role === "founder" || user.role === "ops_head";
  const isStaff = staff.some((s) => s.id === user.id);
  const archived = isBlueprintArchived(client.status);
  // Styling chat follows the Blueprint: Groom To Be only for now.
  const enabled = kind !== "styling" || client.type === "groom";

  let readOnlyReason: string | null = null;
  if (!enabled) readOnlyReason = "Chat isn't available for this programme.";
  else if (archived) readOnlyReason = "This programme has ended, so the conversation is read-only.";
  else if (isAdmin && !isStaff)
    readOnlyReason = "Founders and Ops Heads can read conversations but not post.";
  else if (isClient && staff.length === 0)
    readOnlyReason = `You can message your ${CHAT_KINDS[kind].staffNoun} once one is assigned.`;

  const canRead = enabled && (isClient || isStaff || isAdmin);
  return {
    clientId: client.id,
    clientName: client.name,
    clientCode: client.clientCode,
    clientEmail: client.email,
    clientUserId: client.userId,
    isClient,
    isAdmin,
    isStaff,
    canRead,
    canSend: canRead && readOnlyReason === null && (isClient || isStaff),
    readOnlyReason,
    staff,
  };
}

export async function ensureConversation(clientId: string, kind: ConversationKind) {
  const existing = await prisma.conversation.findUnique({
    where: { clientId_kind: { clientId, kind } },
  });
  if (existing) return existing;
  try {
    return await prisma.conversation.create({ data: { clientId, kind } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.conversation.findUniqueOrThrow({
        where: { clientId_kind: { clientId, kind } },
      });
    }
    throw e;
  }
}

/** Mark the conversation read up to now for one user. */
export async function markRead(
  conversationId: string,
  userId: string,
  at = new Date(),
): Promise<void> {
  await prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, lastReadAt: at },
    update: { lastReadAt: at },
  });
}

export interface MessageView {
  id: string;
  body: string;
  createdAt: Date;
  sender: { id: string; name: string; avatarUrl: string | null; isClient: boolean };
  attachment: { name: string; url: string | null; isImage: boolean } | null;
}

/** The latest messages (oldest first) with attachments signed. */
export async function loadMessages(
  conversationId: string,
  clientUserId: string | null,
  take = 200,
): Promise<MessageView[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      body: true,
      createdAt: true,
      sender: { select: { id: true, name: true, avatarUrl: true } },
      document: { select: { fileName: true, fileUrl: true } },
    },
  });
  const urls = await createSignedUrls(
    rows.flatMap((r) => (r.document ? [r.document.fileUrl] : [])),
  );
  return rows.reverse().map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    sender: { ...r.sender, isClient: r.sender.id === clientUserId },
    attachment: r.document
      ? {
          name: r.document.fileName,
          url: urls.get(r.document.fileUrl) ?? null,
          isImage: /\.(jpe?g|png)$/i.test(r.document.fileUrl),
        }
      : null,
  }));
}

/** Unread counts for one user across conversations (messages from others after their last read). */
export async function unreadCounts(
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!conversationIds.length) return out;
  const rows = await prisma.$queryRaw<{ conversationId: string; n: bigint }[]>`
    SELECT m."conversationId", COUNT(*)::bigint AS n
    FROM "Message" m
    LEFT JOIN "ConversationRead" r ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
    WHERE m."conversationId" = ANY(${conversationIds}::text[])
      AND m."senderId" <> ${userId}
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY m."conversationId"`;
  for (const r of rows) out.set(r.conversationId, Number(r.n));
  return out;
}
