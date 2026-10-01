import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

const MAX_BYTES = 10 * 1024 * 1024; // matches the upload route (SRS §16.2)

/**
 * Picks the client's diet plan PDF without uploading it. The new-plan form
 * holds the file and uploads it once the plan exists, so a cancelled form never
 * leaves an orphaned document in the client's document room.
 */
export function DietPlanPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  function pick(f: File) {
    if (f.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("The PDF is larger than 10 MB.");
      return;
    }
    setError(undefined);
    onChange(f);
  }

  function clear() {
    setError(undefined);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />
      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-5 text-sm text-muted-foreground transition-colors duration-150 hover:border-primary hover:bg-primary/5 hover:text-foreground active:scale-[0.98]"
        >
          <Upload className="h-4 w-4" />
          Choose diet plan PDF
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / (1024 * 1024)).toFixed(1)} MB · uploads when the plan is created
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-danger active:scale-[0.98]"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
