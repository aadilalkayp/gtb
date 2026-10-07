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
  opts: { upsert?: boolean } = {},
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, body, { contentType, upsert: opts.upsert ?? false });
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

/**
 * Sign many documents-bucket paths in one round trip. Paths that fail to sign
 * are left out of the result (callers render a placeholder). `download`
 * makes the browser save the file under that name instead of showing it.
 */
export async function createSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return out;
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(unique, expiresInSeconds);
  if (error) {
    log.warn("bulk sign failed", { count: unique.length, reason: error.message });
    return out;
  }
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Signed URL that downloads the object under `fileName`. */
export async function createDownloadUrl(
  path: string,
  fileName: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds, { download: fileName });
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not sign document URL");
  return data.signedUrl;
}

/** Read a documents-bucket object back (PDF images, ZIP downloads). */
export async function downloadObject(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "Could not read document");
  return Buffer.from(await data.arrayBuffer());
}

/** Best-effort delete of documents-bucket objects (e.g. a replaced diet plan). */
export async function deleteObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove(paths);
  if (error) log.warn("document object delete failed", { paths, reason: error.message });
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

/** Best-effort bulk delete of scan-bucket objects (lead deletion). */
export async function deleteScanObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabaseAdmin.storage.from(SCAN_BUCKET).remove(paths);
  if (error) log.warn("scan photo delete failed", { paths, reason: error.message });
}

/** Read a scan-bucket object back (e.g. the front selfie as context for
 *  outfit analysis or look generation). */
export async function downloadScanObject(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(SCAN_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "Could not read scan photo");
  return Buffer.from(await data.arrayBuffer());
}
