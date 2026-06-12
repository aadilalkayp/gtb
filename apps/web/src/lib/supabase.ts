import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Browser Supabase client. Persists the session in localStorage and refreshes
 * tokens automatically. Only the public anon key is used here.
 *
 * When env is not configured (fresh checkout), we still create a client with
 * placeholder values so imports don't throw; the app shows a setup screen.
 */
export const supabase = createClient(
  env.supabaseUrl || "https://placeholder.supabase.co",
  env.supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
