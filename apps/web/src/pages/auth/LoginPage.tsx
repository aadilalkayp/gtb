import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Input } from "@/components/ui";

export function LoginPage({ portal }: { portal: "staff" | "client" }) {
  const { signIn, session, loading, isClient } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // Once authenticated, send to the right home — even when the GTB profile
  // hasn't loaded yet (MISC-5): a successful sign-in with no provisioned GTB
  // user must not silently leave the form sitting there; the guard pages
  // (RequireOnboarded / staff router) render the "no account" notice.
  useEffect(() => {
    if (session && !loading) {
      navigate(isClient ? "/portal" : "/dashboard", { replace: true });
    }
  }, [session, loading, isClient, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) setError(error);
  }

  const isClientPortal = portal === "client";

  return (
    <div
      data-theme={isClientPortal ? undefined : undefined}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
      />
      <div className="card relative w-full max-w-sm animate-scale-in p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 font-display text-sm font-bold text-primary-foreground">
            GTB
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-display">
            {isClientPortal ? "Welcome back" : "GTB OS"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isClientPortal ? "Sign in to your client portal" : "Staff sign in"}
          </p>
        </div>

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
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <p className="text-right text-sm">
            <Link
              to={isClientPortal ? "/portal/forgot-password" : "/forgot-password"}
              className="font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" className="w-full" loading={submitting}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
