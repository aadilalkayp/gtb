/**
 * Staff <-> client chat (STYLING_BLUEPRINT.md, "Chat"). One shared system;
 * each kind maps a conversation channel to the staff role that answers it.
 * Only styling is switched on (GTB, Oct 2026). Opening another channel means
 * adding a ConversationKind value, its policy clause in schema.zmodel, and an
 * entry here.
 */
import { addWorkingDays, isBlueprintLate } from "./styling.js";

export const CONVERSATION_KINDS = ["styling"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export interface ChatKindConfig {
  /** Assignment role whose holder answers this channel. */
  staffRole: "styling_consultant";
  /** Client-facing name for the staff side ("your stylist"). */
  staffNoun: string;
  /** Portal entry point. */
  portalPath: string;
  /** Staff entry point for one client. */
  staffPath: (clientId: string) => string;
}

export const CHAT_KINDS: Record<ConversationKind, ChatKindConfig> = {
  styling: {
    staffRole: "styling_consultant",
    staffNoun: "stylist",
    portalPath: "/portal/styling?chat=1",
    staffPath: (clientId) => `/clients/${clientId}?tab=styling`,
  },
};

export function isConversationKind(v: unknown): v is ConversationKind {
  return typeof v === "string" && (CONVERSATION_KINDS as readonly string[]).includes(v);
}

export const MAX_MESSAGE_LENGTH = 2000;

/** Unread messages to the client are emailed after this long. */
export const CHAT_EMAIL_AFTER_HOURS = 12;

/** A client message unanswered for this many working days is flagged to Ops. */
export const CHAT_REPLY_WORKING_DAYS = 2;

/** True when the client spoke last and has waited past the reply target. */
export function isReplyOverdue(
  c: { lastMessageAt: Date | string | null; lastSenderIsClient: boolean },
  now = new Date(),
): boolean {
  if (!c.lastSenderIsClient || !c.lastMessageAt) return false;
  return isBlueprintLate(addWorkingDays(new Date(c.lastMessageAt), CHAT_REPLY_WORKING_DAYS), now);
}
