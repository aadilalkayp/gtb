import { useState } from "react";
import { AlertTriangle, Check, Copy, Mail } from "lucide-react";
import type { InviteResult } from "@/lib/api";

/**
 * Result of a client or staff invite: whether the email went out (and why not),
 * plus the registration link for staff to share directly. The API withholds
 * the link once the invitee has already set up their account.
 */
export function InviteOutcome({ result }: { result: InviteResult }) {
  const [copied, setCopied] = useState(false);
  const url = result.registrationUrl;

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {result.emailed ? (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-4 w-4" />
            </span>
            {url ? "Invitation emailed. You can also share this link" : "Invitation emailed"}
          </>
        ) : (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/15 text-warning">
              <Mail className="h-4 w-4" />
            </span>
            {result.mailError ? "Email failed to send" : "Email not sent"}
            {url && ". Share this link"}
          </>
        )}
      </div>

      {url && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <code className="flex-1 truncate text-xs text-muted-foreground">{url}</code>
          <button
            onClick={() => void copyLink()}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted active:scale-[0.98]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {result.alreadyRegistered && (
        <p className="text-xs text-muted-foreground">
          This account is already set up, so no link is shown. If they can't sign in, they can
          use "Forgot password" on the login page.
        </p>
      )}

      {[result.mailError, result.warning].filter(Boolean).map((msg) => (
        <p key={msg} className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {msg}
        </p>
      ))}
    </div>
  );
}
