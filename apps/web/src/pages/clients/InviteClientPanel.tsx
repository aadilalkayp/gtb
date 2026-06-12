import { useState } from "react";
import { Mail, Check, Copy, AlertTriangle, Send } from "lucide-react";
import { inviteClient, type InviteResult } from "@/lib/api";
import { Button } from "@/components/ui";

/**
 * Sends (or resends) a registration invite for a lead and surfaces the result —
 * whether the email went out, plus a copyable registration link as a fallback.
 */
export function InviteClientPanel({
  clientId,
  alreadyInvited,
  onInvited,
}: {
  clientId: string;
  alreadyInvited?: boolean;
  onInvited?: () => void;
}) {
  const [result, setResult] = useState<InviteResult>();
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function send() {
    setSending(true);
    setError(undefined);
    try {
      const res = await inviteClient(clientId);
      setResult(res);
      onInvited?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    if (!result?.registrationUrl) return;
    await navigator.clipboard.writeText(result.registrationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!result) {
    return (
      <div className="space-y-2">
        <Button onClick={send} loading={sending} variant={alreadyInvited ? "outline" : "primary"}>
          <Send className="h-4 w-4" />
          {alreadyInvited ? "Resend invitation" : "Send invitation"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {result.emailed ? (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-4 w-4" />
            </span>
            Invitation emailed
          </>
        ) : (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/15 text-[hsl(35_92%_38%)]">
              <Mail className="h-4 w-4" />
            </span>
            Email not sent — share this link
          </>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
        <code className="flex-1 truncate text-xs text-muted-foreground">
          {result.registrationUrl}
        </code>
        <button
          onClick={copyLink}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {result.warning && (
        <p className="flex items-start gap-1.5 text-xs text-[hsl(35_92%_38%)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.warning}
        </p>
      )}

      <button onClick={send} className="text-xs font-medium text-primary hover:underline">
        Resend
      </button>
    </div>
  );
}
