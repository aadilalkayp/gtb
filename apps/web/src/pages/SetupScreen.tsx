/** Shown when the Supabase env vars are missing (fresh checkout). */
export function SetupScreen() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
      />
      <div className="card relative w-full max-w-lg animate-scale-in p-8 shadow-lg">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 font-display text-sm font-bold text-primary-foreground">
          GTB
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-display">Finish setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GTB OS needs a Supabase project before it can run.
        </p>
        <ol className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="font-mono text-muted-foreground">1.</span>
            <span>
              Create a Supabase project, then copy its URL and anon key into{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">apps/web/.env</code>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-muted-foreground">2.</span>
            <span>
              Set the database + service-role keys in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">apps/api/.env</code> and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">packages/db/.env</code>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-muted-foreground">3.</span>
            <span>
              Run <code className="rounded bg-muted px-1.5 py-0.5">pnpm db:migrate</code> then{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pnpm dev</code>.
            </span>
          </li>
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">
          See <code className="rounded bg-muted px-1.5 py-0.5">.env.example</code> in each package
          for the full list of variables.
        </p>
      </div>
    </div>
  );
}
