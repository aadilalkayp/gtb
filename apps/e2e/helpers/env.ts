/**
 * Single source of truth for every URL, port, and key the E2E suite uses.
 *
 * The local Supabase CLI issues the same well-known demo JWTs for every local
 * project (signed with the public demo secret, `iss: supabase-demo`). They are
 * not secrets — they only work against a stack on this machine — which lets
 * the whole environment be deterministic with zero key plumbing.
 */

export const E2E = {
  /** Supabase stack (project_id gtb_e2e, see supabase/config.toml). */
  supabaseUrl: "http://127.0.0.1:54521",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54522/postgres",
  inbucketUrl: "http://127.0.0.1:54525",

  /** Apps under test (separate ports so they never collide with `pnpm dev`). */
  webUrl: "http://localhost:5185",
  apiUrl: "http://localhost:3105",
  webPort: 5185,
  apiPort: 3105,

  /** Standard local-development demo JWTs (public constants, local-only). */
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  serviceRoleKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  jwtSecret: "super-secret-jwt-token-with-at-least-32-characters-long",

  password: "gtb-e2e-password",
} as const;

/** Env injected into the api (Next.js) dev server. */
export function apiEnv(): Record<string, string> {
  return {
    DATABASE_URL: E2E.databaseUrl,
    DIRECT_URL: E2E.databaseUrl,
    SUPABASE_URL: E2E.supabaseUrl,
    SUPABASE_ANON_KEY: E2E.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: E2E.serviceRoleKey,
    SUPABASE_JWT_SECRET: E2E.jwtSecret,
    WEB_ORIGIN: E2E.webUrl,
    API_PUBLIC_URL: E2E.apiUrl,
    WEB_PUBLIC_URL: E2E.webUrl,
    PORT: String(E2E.apiPort),
    // Mailgun is intentionally unset: outbound email must never fire from a
    // test run. The API treats missing SMTP config as "log instead of send".
    MAILGUN_SMTP_HOST: "",
    NODE_ENV: "development",
  };
}

/** Env injected into the web (Vite) dev server. Process env beats .env files. */
export function webEnv(): Record<string, string> {
  return {
    VITE_SUPABASE_URL: E2E.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: E2E.anonKey,
    VITE_API_URL: E2E.apiUrl,
  };
}
