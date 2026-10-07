import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { CHAT_KINDS, formatDate } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useChatInbox } from "@/lib/chatApi";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Badge, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Staff inbox: every client conversation on a channel the caller answers
 * (stylists: their clients; Founder and Ops Head: all, read-only). Opening a
 * row goes to the client's Styling tab, where the thread lives.
 */
export function MessagesPage() {
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const { data, isLoading, isError, error, refetch } = useChatInbox();

  return (
    <div className="page">
      <PageHeader
        title="Messages"
        subtitle={
          isAdmin
            ? "Every client conversation, for oversight. Replies come from the client's stylist."
            : "Conversations with your clients."
        }
      />
      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : isError ? (
          <QueryErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : !data?.conversations.length ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            hint="Messages from clients will appear here."
          />
        ) : (
          <div className="card divide-y divide-border">
            {data.conversations.map((c) => (
              <Link
                key={c.id}
                to={CHAT_KINDS[c.kind].staffPath(c.client.id)}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm", c.unread > 0 ? "font-semibold" : "font-medium")}>
                      {c.client.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.client.clientCode}</span>
                    {c.replyOverdue && <Badge tone="warning">Waiting for a reply</Badge>}
                  </div>
                  {c.preview && (
                    <p
                      className={cn(
                        "truncate text-sm",
                        c.unread > 0 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span className="text-muted-foreground">
                        {c.preview.sender.split(" ")[0]}:{" "}
                      </span>
                      {c.preview.body}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-num text-xs text-muted-foreground">
                    {formatDate(c.lastMessageAt)}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {c.unread}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
