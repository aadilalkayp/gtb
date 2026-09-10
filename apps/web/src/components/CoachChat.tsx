import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { askCoach, fetchCoachHistory, type CoachChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button, Spinner } from "@/components/ui";

const SUGGESTIONS = [
  "When should I get my big day haircut?",
  "My skin looks oily in photos. What should I change?",
  "What colours suit me for the reception?",
  "What should the last two weeks look like?",
];

/**
 * The GTB Coach (Step 8): a scoped assistant answering from GTB's knowledge
 * base and the person's own scan. Same component on the report page (leads)
 * and in the portal (clients).
 */
export function CoachChat({ scanId, compact = false }: { scanId: string; compact?: boolean }) {
  const [messages, setMessages] = useState<CoachChatMessage[] | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCoachHistory(scanId)
      .then((h) => {
        setMessages(h.messages);
        setConversationId(h.conversationId);
      })
      .catch(() => setMessages([]));
  }, [scanId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages?.length, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    const optimistic: CoachChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: message,
      sources: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...(m ?? []), optimistic]);
    try {
      const res = await askCoach({ scanId, conversationId, message });
      setConversationId(res.conversationId);
      setMessages((m) => [...(m ?? []), res.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coach is unavailable right now.");
      setMessages((m) => (m ?? []).filter((x) => x.id !== optimistic.id));
      setInput(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <MessageCircle className="h-5 w-5 text-primary" /> Ask the GTB coach
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grooming, hair, style and big day prep questions, answered from GTB's method and your own
          scan. Not medical advice.
        </p>
      </div>

      <div
        className={cn(
          "mt-4 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3",
          compact ? "max-h-72" : "max-h-[28rem] min-h-[12rem]",
        )}
      >
        {messages === null ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try one of these:</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm border border-border bg-surface",
                )}
              >
                {m.content}
                {m.role === "assistant" && m.sources.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    From GTB's method: {m.sources.join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-2 text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your routine, hair, outfit or timeline…"
          maxLength={800}
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm shadow-xs placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10"
        />
        <Button type="submit" disabled={!input.trim() || busy} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
