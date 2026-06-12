import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Admin client (service-role key) — bypasses Supabase RLS and can manage auth
 * users (invite, create, delete). Server-only; never expose the key.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Anon client used to validate a caller's access token via getUser(token).
 */
export const supabaseAnon: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
