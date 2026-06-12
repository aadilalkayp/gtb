/** Centralised, validated access to Vite env vars. */

interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
  /** True when the Supabase env vars are absent (e.g. fresh checkout before .env setup). */
  configured: boolean;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const env: Env = {
  supabaseUrl,
  supabaseAnonKey,
  apiUrl,
  configured: Boolean(supabaseUrl && supabaseAnonKey),
};

if (!env.configured) {
  // Don't throw — let the app boot and show a setup screen instead.
  console.warn(
    "[GTB OS] Supabase env vars missing. Copy apps/web/.env.example to .env and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
  );
}
