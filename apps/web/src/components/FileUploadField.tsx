import { useEffect, useRef, useState } from "react";
import { Upload, FileText, X, Loader2, Check } from "lucide-react";
import { uploadClientDocument, type UploadedDocument } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Uploads a single file through the server storage route and reports the created
 * Document. Shows an inline image preview (or filename for PDFs). Used for the
 * onboarding profile photo and payment proof.
 */
export function FileUploadField({
  clientId,
  type,
  sessionId,
  accept = "image/*,application/pdf",
  label = "Upload file",
  onUploaded,
  className,
}: {
  clientId: string;
  type: string;
  sessionId?: string;
  accept?: string;
  label?: string;
  onUploaded: (doc: UploadedDocument | null) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url?: string; name: string; isImage: boolean }>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  // Revoke object URLs when they change/unmount to avoid leaks.
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  async function handleFile(file: File) {
    setError(undefined);
    setUploading(true);
    const isImage = file.type.startsWith("image/");
    const localUrl = isImage ? URL.createObjectURL(file) : undefined;
    setPreview({ url: localUrl, name: file.name, isImage });
    try {
      const doc = await uploadClientDocument({ clientId, type, file, sessionId });
      onUploaded(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPreview(undefined);
      onUploaded(null);
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setPreview(undefined);
    setError(undefined);
    onUploaded(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <Upload className="h-4 w-4" />
          {label}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
          {preview.isImage && preview.url ? (
            <img src={preview.url} alt="" className="h-12 w-12 rounded-md object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{preview.name}</p>
            <p className={cn("text-xs", uploading ? "text-muted-foreground" : "text-success")}>
              {uploading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3 w-3" /> Uploaded
                </span>
              )}
            </p>
          </div>
          {!uploading && (
            <button
              type="button"
              onClick={clear}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
