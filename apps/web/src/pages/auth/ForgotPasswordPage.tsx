import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input } from "@/components/ui";

/**
 * Requests a password-reset email. Supabase sends a recovery link that lands on
 * /reset-password, where the session from the link lets the user set a new
 * password. We show the same confirmation whether or not the email exists so
 * the form can't be used to probe for accounts.
 */
export function ForgotPasswordPage({ portal }: { portal: "staff" | "client" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loginPath = portal === "client" ? "/portal/login" : "/login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-sm font-bold text-sidebar-foreground">
            GTB
          </div>
          <h1 className="text-lg font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sent
              ? "Check your inbox"
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {sent ? (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email.trim()}</span>,
              a password reset link is on its way. The link expires after a short while, so use the
              most recent email.
            </p>
            <Button className="w-full" variant="outline" onClick={() => navigate(loginPath)}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" className="w-full" loading={submitting}>
              Send reset link
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link to={loginPath} className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
