import { supabaseAdmin } from "./supabase.js";

/** Private Storage bucket holding all client documents (proofs, photos, plans, receipts). */
export const DOCUMENTS_BUCKET = "client-documents";

/** Upload a file buffer to the documents bucket. Returns a normalized error shape. */
export async function uploadObject(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  return { error: error ? { message: error.message } : null };
}

/** Mint a short-lived signed URL for a stored object path. */
export async function createSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign document URL");
  }
  return data.signedUrl;
}
