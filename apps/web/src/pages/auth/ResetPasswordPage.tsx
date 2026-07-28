import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Input } from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";

/**
 * New-password page reached from the recovery email link. Like the invite flow
 * (RegisterPage), Supabase establishes a session from the link
 * (detectSessionInUrl), so by the time we render the user is authenticated and
 * just needs to choose a new password.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { loading, session, user, isClient } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullPageSpinner />;

  if (!session) {
    return (
      <Shell title="Link expired" subtitle="This password reset link is invalid or has expired.">
        <p className="text-sm text-muted-foreground">
          Reset links can only be used once and expire quickly. Request a new one and open the
          latest email.
        </p>
        <Button
          className="mt-5 w-full"
          variant="outline"
          onClick={() => navigate("/forgot-password")}
        >
          Request a new link
        </Button>
      </Shell>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate(isClient ? "/portal" : "/dashboard", { replace: true });
  }

  return (
    <Shell
      title="Choose a new password"
      subtitle={user?.email ? `Resetting password for ${user.email}` : undefined}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" loading={submitting}>
          Update password
        </Button>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-sm font-bold text-sidebar-foreground">
            GTB
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
