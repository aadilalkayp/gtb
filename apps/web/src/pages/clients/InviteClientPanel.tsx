import { useState } from "react";
import { Send } from "lucide-react";
import { inviteClient, type InviteResult } from "@/lib/api";
import { Button } from "@/components/ui";
import { InviteOutcome } from "@/components/InviteOutcome";

/**
 * Sends (or resends) a registration invite for a lead and surfaces the result —
 * whether the email went out, plus a copyable registration link to share.
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
      <InviteOutcome result={result} />

      <button
        onClick={send}
        className="text-xs font-medium text-primary transition-colors duration-150 hover:underline"
      >
        Resend
      </button>
    </div>
  );
}
