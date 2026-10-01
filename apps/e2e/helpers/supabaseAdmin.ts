/** Service-role Supabase client for the e2e stack (auth users, buckets). */
import { createClient } from "@supabase/supabase-js";
import { E2E } from "./env.js";

export const supabaseAdmin = createClient(E2E.supabaseUrl, E2E.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Create a confirmed-email auth user (confirmed so first-login linking works). */
export async function createAuthUser(email: string, password = E2E.password): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createAuthUser(${email}) failed: ${error?.message}`);
  }
  return data.user.id;
}

/** Idempotently create (and empty) the private buckets the API expects. */
export async function ensureBuckets(): Promise<void> {
  for (const name of ["client-documents", "scan-photos"]) {
    const { error } = await supabaseAdmin.storage.createBucket(name, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`createBucket(${name}) failed: ${error.message}`);
    }
    // Direct SQL deletes on storage tables are forbidden, so the per-run
    // wipe of leftover objects goes through the Storage API.
    const { error: emptyError } = await supabaseAdmin.storage.emptyBucket(name);
    if (emptyError && !/not found/i.test(emptyError.message)) {
      throw new Error(`emptyBucket(${name}) failed: ${emptyError.message}`);
    }
  }
}
