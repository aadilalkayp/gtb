import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Lock, Paperclip, Send, X } from "lucide-react";
import { CHAT_KINDS, MAX_MESSAGE_LENGTH, formatDate, type ConversationKind } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { CHAT_INBOX_KEY, sendChatMessage, useChatThread, type ChatMessage } from "@/lib/chatApi";
import { Avatar } from "@/components/ui/Avatar";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * One staff <-> client conversation, shared by the portal and the staff
 * Styling tab. Polls every 10 seconds while open; opening it marks it read.
 */
export function ChatThread({
  kind,
  clientId,
  className,
}: {
  kind: ConversationKind;
  /** Staff only; the client's own thread needs none. */
  clientId?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useChatThread(kind, clientId);
  const scroller = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const isClient = user?.role === "client";

  // Keep the newest message in view when messages arrive.
  useLayoutEffect(() => {
    const n = data?.messages.length ?? 0;
    if (n !== lastCount.current && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
    lastCount.current = n;
  }, [data?.messages.length]);

  // The GET marks the thread read: refresh unread badges after each load.
  useEffect(() => {
    if (data) void qc.invalidateQueries({ queryKey: CHAT_INBOX_KEY });
  }, [data, qc]);

  if (isLoading) {
    return (
      <div className={cn("flex justify-center py-12", className)}>
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        Messages couldn't load.{" "}
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  const staffName = data.staff[0]?.name ?? null;
  const staffNoun = CHAT_KINDS[kind].staffNoun;
  const ownLast = [...data.messages].reverse().find((m) => m.sender.id === user?.id);
  const seen = Boolean(
    ownLast &&
    data.otherLastReadAt &&
    new Date(data.otherLastReadAt).getTime() >= new Date(ownLast.createdAt).getTime(),
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scroller}
        className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-1 py-2"
        aria-live="polite"
      >
        {data.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {isClient
                ? `Ask ${staffName?.split(" ")[0] ?? `your ${staffNoun}`} anything`
                : "No messages yet"}
            </p>
            <p>
              {isClient
                ? "Questions about your looks, sizes, shopping or the big day."
                : `Start the conversation with ${data.client.name.split(" ")[0]}.`}
            </p>
          </div>
        ) : (
          data.messages.map((m, i) => {
            const prev = data.messages[i - 1];
            const newDay =
              !prev ||
              new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <div key={m.id} className="space-y-3">
                {newDay && (
                  <p className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {formatDate(m.createdAt)}
                  </p>
                )}
                <Bubble message={m} own={m.sender.id === user?.id} />
              </div>
            );
          })
        )}
        {seen && <p className="pr-1 text-right text-[11px] text-muted-foreground">Seen</p>}
      </div>

      {data.canSend ? (
        <Composer
          kind={kind}
          clientId={clientId}
          onSent={async () => {
            await refetch();
            await qc.invalidateQueries({ queryKey: CHAT_INBOX_KEY });
          }}
        />
      ) : (
        <p className="mt-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {data.readOnlyReason}
        </p>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" />
        {isClient
          ? `${staffName ? `${staffName.split(" ")[0]} usually replies` : "Replies usually come"} within 1 working day. Your GTB team can see this conversation.`
          : "The client is told GTB's team can read this. Keep conversations here; don't share personal numbers."}
      </p>
    </div>
  );
}

function Bubble({ message, own }: { message: ChatMessage; own: boolean }) {
  const time = new Date(message.createdAt).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className={cn("flex items-end gap-2", own && "flex-row-reverse")}>
      {!own && <Avatar name={message.sender.name} src={message.sender.avatarUrl} size="sm" />}
      <div className={cn("max-w-[78%] space-y-1", own && "items-end text-right")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed",
            own
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground",
          )}
        >
          {message.attachment && <Attachment a={message.attachment} own={own} />}
          {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        </div>
        <p className="px-1 text-[11px] text-muted-foreground">
          {own ? "" : `${message.sender.name.split(" ")[0]} · `}
          {time}
        </p>
      </div>
    </div>
  );
}

function Attachment({ a, own }: { a: NonNullable<ChatMessage["attachment"]>; own: boolean }) {
  if (a.isImage && a.url) {
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        className="mb-1.5 block overflow-hidden rounded-lg"
      >
        <img
          src={a.url}
          alt={a.name}
          className="max-h-56 w-auto max-w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  return (
    <a
      href={a.url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium",
        own ? "bg-white/15" : "bg-surface",
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{a.name}</span>
    </a>
  );
}

function Composer({
  kind,
  clientId,
  onSent,
}: {
  kind: ConversationKind;
  clientId?: string;
  onSent: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [body]);

  async function send() {
    if ((!body.trim() && !file) || sending) return;
    setSending(true);
    setError(undefined);
    try {
      await sendChatMessage({ kind, body: body.trim(), file, clientId });
      setBody("");
      setFile(null);
      if (input.current) input.current.value = "";
      await onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message not sent");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {file && (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">{file.name}</span>
          <button type="button" aria-label="Remove attachment" onClick={() => setFile(null)}>
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-1.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Attach a photo or PDF"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          ref={area}
          rows={1}
          value={body}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a message"
          aria-label="Message"
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          size="icon"
          onClick={() => void send()}
          loading={sending}
          disabled={!body.trim() && !file}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
