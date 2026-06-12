import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Input } from "@/components/ui";

export function LoginPage({ portal }: { portal: "staff" | "client" }) {
  const { signIn, session, user, isClient } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // Once authenticated + profile resolved, send to the right home.
  useEffect(() => {
    if (session && user) {
      navigate(isClient ? "/portal" : "/dashboard", { replace: true });
    }
  }, [session, user, isClient, navigate]);

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
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-sm font-bold text-sidebar-foreground">
            GTB
          </div>
          <h1 className="text-lg font-semibold">{isClientPortal ? "Welcome back" : "GTB OS"}</h1>
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

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" className="w-full" loading={submitting}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
