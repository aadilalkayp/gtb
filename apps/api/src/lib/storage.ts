import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

const log = logger.child({ mod: "storage" });

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

/** Private Storage bucket for Readiness Scan selfies. Separate from
 *  client-documents: scan photos have their own retention policy (anonymous
 *  scans are purged after 24h by the daily job). */
export const SCAN_BUCKET = "scan-photos";

export async function uploadScanObject(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.storage
    .from(SCAN_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  return { error: error ? { message: error.message } : null };
}

export async function createScanSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(SCAN_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign scan photo URL");
  }
  return data.signedUrl;
}

/** Best-effort delete (used by the anonymous-scan purge job). */
export async function deleteScanObject(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(SCAN_BUCKET).remove([path]);
  if (error) log.warn("scan photo delete failed", { path, reason: error.message });
}
