/**
 * Shared upload validation for every route that stores a client file
 * (documents/upload, styling photos and images, chat attachments).
 *
 * SRS §16.2: JPEG, PNG, PDF and DOCX up to 10 MB. `file.type` is
 * client-controlled, so the declared MIME must match the file's magic bytes.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME = new Set(["image/jpeg", "image/png"]);

export const DOCUMENT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAGIC_BYTES: { mime: string; signature: number[] }[] = [
  { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46] },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: [0x50, 0x4b, 0x03, 0x04],
  }, // DOCX (zip container)
];

export function sniffMime(buffer: Buffer): string | undefined {
  for (const { mime, signature } of MAGIC_BYTES) {
    if (signature.every((b, i) => buffer[i] === b)) return mime;
  }
  return undefined;
}

export function slugifyName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "";
  return ext ? `${base || "file"}.${ext}` : base || "file";
}

export interface ValidUpload {
  buffer: Buffer;
  mime: string;
  /** Original name, for display. */
  name: string;
  /** Storage-safe name. */
  safeName: string;
  size: number;
}

/**
 * Read and validate the `file` part of a multipart form. Returns the file or
 * a user-facing error with its HTTP status.
 */
export async function readUpload(
  form: FormData,
  allowed: Set<string>,
  field = "file",
): Promise<{ ok: true; file: ValidUpload } | { ok: false; error: string; status: number }> {
  const file = form.get(field);
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "file is required", status: 400 };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File is larger than 10 MB", status: 413 };
  }
  const declared = file.type || "application/octet-stream";
  if (!allowed.has(declared)) {
    const kinds = allowed === IMAGE_MIME ? "JPEG and PNG photos" : "JPEG, PNG, PDF and DOCX files";
    return { ok: false, error: `Only ${kinds} are allowed`, status: 415 };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffMime(buffer) !== declared) {
    return { ok: false, error: "File content does not match its declared type", status: 415 };
  }
  const name = file.name || "upload";
  return {
    ok: true,
    file: { buffer, mime: declared, name, safeName: slugifyName(name), size: file.size },
  };
}
