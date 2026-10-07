import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import {
  CHAT_KINDS,
  MAX_MESSAGE_LENGTH,
  isConversationKind,
  type ConversationKind,
} from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { chatAccess, ensureConversation, loadMessages, markRead, unreadCounts } from "@/lib/chat";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { notifyUsers } from "@/lib/notify";
import { deleteObjects, uploadObject } from "@/lib/storage";
import { ownClientId } from "@/lib/styling";
import { IMAGE_MIME, readUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const ATTACHMENT_MIME = new Set([...IMAGE_MIME, "application/pdf"]);

async function resolveClientId(
  user: { id: string; role: string },
  given: string | null,
): Promise<string | null> {
  if (user.role === "client") return ownClientId(user as Parameters<typeof ownClientId>[0]);
  return given;
}

/**
 * GET /api/messages?kind=styling[&clientId=...]: the conversation, its latest
 * messages, and what the caller may do. Reading marks it read for the caller
 * (admins reading for oversight don't count as the stylist having read it).
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (!isConversationKind(kind)) return json(req, { error: "Unknown conversation kind" }, 400);
  const clientId = await resolveClientId(user, url.searchParams.get("clientId"));
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await chatAccess(user, clientId, kind);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!access.canRead) return json(req, { error: "Forbidden" }, 403);

  const conversation = await ensureConversation(clientId, kind);
  const messages = await loadMessages(conversation.id, access.clientUserId);
  const unread = (await unreadCounts(user.id, [conversation.id])).get(conversation.id) ?? 0;
  if (access.isClient || access.isStaff) await markRead(conversation.id, user.id);

  // When the other side last read, for "Seen" on the caller's own messages.
  const otherRead = await prisma.conversationRead.findMany({
    where: {
      conversationId: conversation.id,
      userId: access.isClient ? { in: access.staff.map((s) => s.id) } : (access.clientUserId ?? ""),
    },
    orderBy: { lastReadAt: "desc" },
    take: 1,
    select: { lastReadAt: true },
  });

  return json(req, {
    conversation: { id: conversation.id, kind },
    client: { id: access.clientId, name: access.clientName },
    staff: access.staff,
    canSend: access.canSend,
    readOnlyReason: access.readOnlyReason,
    unreadBefore: unread,
    otherLastReadAt: otherRead[0]?.lastReadAt ?? null,
    messages,
  });
}

/**
 * POST /api/messages (multipart): kind, body, optional file (JPEG, PNG or PDF
 * up to 10 MB), and clientId for staff. The other side gets one in-app
 * notification per unread stretch; unread client messages are emailed after
 * 12 hours by the hourly job.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Expected multipart/form-data" }, 400);
  }
  const kind = form.get("kind");
  if (!isConversationKind(kind)) return json(req, { error: "Unknown conversation kind" }, 400);
  const givenClient = form.get("clientId");
  const clientId = await resolveClientId(
    user,
    typeof givenClient === "string" ? givenClient : null,
  );
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const rawBody = form.get("body");
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  const hasFile = form.get("file") !== null && typeof form.get("file") !== "string";
  if (!body && !hasFile) return json(req, { error: "Write a message or attach a file" }, 400);
  if (body.length > MAX_MESSAGE_LENGTH) {
    return json(req, { error: `Keep messages under ${MAX_MESSAGE_LENGTH} characters` }, 400);
  }

  const access = await chatAccess(user, clientId, kind as ConversationKind);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!access.canRead) return json(req, { error: "Forbidden" }, 403);
  if (!access.canSend)
    return json(req, { error: access.readOnlyReason ?? "You can't post here" }, 403);

  // Light flood guard: 20 messages a minute per sender.
  const recent = await prisma.message.count({
    where: { senderId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 20)
    return json(req, { error: "You're sending messages too quickly. Wait a moment." }, 429);

  const conversation = await ensureConversation(clientId, kind as ConversationKind);

  let documentId: string | undefined;
  let storedPath: string | undefined;
  if (hasFile) {
    const upload = await readUpload(form, ATTACHMENT_MIME);
    if (!upload.ok) return json(req, { error: upload.error }, upload.status);
    storedPath = `${clientId}/chat_attachment/${crypto.randomUUID()}-${upload.file.safeName}`;
    const { error } = await uploadObject(storedPath, upload.file.buffer, upload.file.mime);
    if (error) {
      requestLog(req).error("chat attachment upload failed", {
        path: storedPath,
        reason: error.message,
      });
      return json(req, { error: "Upload failed. Please try again." }, 502);
    }
    const doc = await prisma.document.create({
      data: {
        clientId,
        type: "chat_attachment",
        fileName: upload.file.name,
        fileUrl: storedPath,
        fileSize: upload.file.size,
        uploadedById: user.id,
      },
      select: { id: true },
    });
    documentId = doc.id;
  }

  const now = new Date();
  let message;
  try {
    message = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: { conversationId: conversation.id, senderId: user.id, body, documentId },
        select: { id: true, createdAt: true },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now, lastSenderIsClient: access.isClient },
      });
      return m;
    });
  } catch (e) {
    if (documentId)
      await prisma.document.delete({ where: { id: documentId } }).catch(() => undefined);
    if (storedPath) await deleteObjects([storedPath]);
    throw e;
  }
  await markRead(conversation.id, user.id, now);

  // One notification per unread stretch: skip if the recipient still has an
  // unread one for this conversation.
  const cfg = CHAT_KINDS[kind as ConversationKind];
  const recipients = access.isClient
    ? access.staff.map((s) => s.id)
    : access.clientUserId
      ? [access.clientUserId]
      : [];
  const linkPath = access.isClient ? cfg.staffPath(clientId) : cfg.portalPath;
  const pending = await prisma.notification.findMany({
    where: { userId: { in: recipients }, type: "chat_message", linkPath, isRead: false },
    select: { userId: true },
  });
  const already = new Set(pending.map((p) => p.userId));
  const senderName = access.isClient
    ? access.clientName
    : (access.staff.find((s) => s.id === user.id)?.name ?? "Your stylist");
  await notifyUsers(
    recipients.filter((r) => !already.has(r)),
    {
      type: "chat_message",
      title: `New message from ${senderName.split(" ")[0]}`,
      body: body ? body.slice(0, 140) : "Sent an attachment",
      linkPath,
    },
  );

  return json(req, { ok: true, message: { id: message.id, createdAt: message.createdAt } });
}

export const GET = withRequestLog(handleGet);
export const POST = withRequestLog(handlePost);
