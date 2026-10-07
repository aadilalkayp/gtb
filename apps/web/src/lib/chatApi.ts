/** Staff <-> client chat calls (apps/api/src/app/api/messages/*). */
import { useQuery } from "@tanstack/react-query";
import type { ConversationKind } from "@gtb/shared";
import { authedFetch } from "./api";
import { env } from "./env";

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; avatarUrl: string | null; isClient: boolean };
  attachment: { name: string; url: string | null; isImage: boolean } | null;
}

export interface ChatThreadData {
  conversation: { id: string; kind: ConversationKind };
  client: { id: string; name: string };
  staff: { id: string; name: string; avatarUrl: string | null }[];
  canSend: boolean;
  readOnlyReason: string | null;
  unreadBefore: number;
  otherLastReadAt: string | null;
  messages: ChatMessage[];
}

export interface InboxRow {
  id: string;
  kind: ConversationKind;
  client: { id: string; name: string; clientCode: string };
  lastMessageAt: string;
  lastSenderIsClient: boolean;
  replyOverdue: boolean;
  preview: { sender: string; body: string } | null;
  unread: number;
}

async function fail(res: Response): Promise<never> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(json?.error || `Request failed (${res.status})`);
}

export function chatThreadKey(kind: ConversationKind, clientId?: string) {
  return ["chat-thread", kind, clientId ?? "self"] as const;
}

export const CHAT_INBOX_KEY = ["chat-inbox"] as const;

/** One conversation; polls every 10s while mounted (no realtime). */
export function useChatThread(kind: ConversationKind, clientId?: string) {
  return useQuery({
    queryKey: chatThreadKey(kind, clientId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const q = new URLSearchParams({ kind });
      if (clientId) q.set("clientId", clientId);
      const res = await authedFetch(`${env.apiUrl}/api/messages?${q.toString()}`);
      if (!res.ok) return fail(res);
      return (await res.json()) as ChatThreadData;
    },
  });
}

/** Conversations with unread counts; drives the Messages page and badges. */
export function useChatInbox(enabled = true) {
  return useQuery({
    queryKey: CHAT_INBOX_KEY,
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await authedFetch(`${env.apiUrl}/api/messages/inbox`);
      if (!res.ok) return fail(res);
      return (await res.json()) as { conversations: InboxRow[]; totalUnread: number };
    },
  });
}

export async function sendChatMessage(args: {
  kind: ConversationKind;
  body: string;
  file?: File | null;
  clientId?: string;
}) {
  const form = new FormData();
  form.append("kind", args.kind);
  form.append("body", args.body);
  if (args.clientId) form.append("clientId", args.clientId);
  if (args.file) form.append("file", args.file);
  const res = await authedFetch(`${env.apiUrl}/api/messages`, { method: "POST", body: form });
  if (!res.ok) return fail(res);
  return (await res.json()) as { ok: boolean };
}
