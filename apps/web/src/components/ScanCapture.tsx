import { useRef, useState } from "react";
import { Camera, Plus, RefreshCw, X } from "lucide-react";
import { checkFraming } from "@/lib/framing";
import { cn } from "@/lib/utils";

export interface CapturedPhotos {
  front: File | null;
  fullBody: File | null;
  left: File | null;
  right: File | null;
}

export const EMPTY_PHOTOS: CapturedPhotos = {
  front: null,
  fullBody: null,
  left: null,
  right: null,
};

type Slot = keyof CapturedPhotos;

const OPTIONAL_SLOTS: {
  key: Exclude<Slot, "front">;
  label: string;
  hint: string;
  capture?: "user" | "environment";
}[] = [
  { key: "fullBody", label: "Full-body", hint: "Unlocks your Style score", capture: "environment" },
  { key: "left", label: "Left side", hint: "Sharper hair & beard scoring", capture: "user" },
  { key: "right", label: "Right side", hint: "Sharper hair & beard scoring", capture: "user" },
];

/**
 * Photo picker for a scan: the front selfie (required, framing pre-checked
 * on-device) plus optional angles. Shared by the public funnel and the portal
 * rescan so both produce identical multi-photo scans.
 */
export function ScanCapture({
  photos,
  onChange,
  onError,
  compact = false,
}: {
  photos: CapturedPhotos;
  onChange: (next: CapturedPhotos) => void;
  onError: (message: string | null) => void;
  compact?: boolean;
}) {
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({});
  const inputs = useRef<Partial<Record<Slot, HTMLInputElement | null>>>({});

  const setSlot = async (slot: Slot, file: File | null) => {
    onError(null);
    const prev = previews[slot];
    if (prev) URL.revokeObjectURL(prev);
    setPreviews((p) => ({ ...p, [slot]: file ? URL.createObjectURL(file) : undefined }));
    if (slot === "front" && file) {
      const framingError = await checkFraming(file);
      if (framingError) {
        onError(framingError);
        onChange({ ...photos, front: null }); // keep the preview so they see what to fix
        return;
      }
    }
    onChange({ ...photos, [slot]: file });
  };

  const input = (slot: Slot, capture: "user" | "environment") => (
    <input
      ref={(el) => {
        inputs.current[slot] = el;
      }}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture={capture}
      className="hidden"
      onChange={(e) => {
        void setSlot(slot, e.target.files?.[0] ?? null);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="space-y-4">
      {/* Front selfie — required */}
      <button
        type="button"
        onClick={() => inputs.current.front?.click()}
        className={cn(
          "relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-card border-2 border-dashed border-border bg-surface transition-colors duration-150 hover:border-primary/50 active:scale-[0.99]",
          compact ? "aspect-[16/9]" : "aspect-[4/3]",
        )}
      >
        {previews.front ? (
          <img
            src={previews.front}
            alt="Your selfie"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Camera className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium">Take or upload a selfie</span>
            <span className="px-8 text-xs text-muted-foreground">
              Face the camera straight on, in even daylight, no filters — the clearer the photo, the
              truer the score.
            </span>
          </>
        )}
      </button>
      {input("front", "user")}
      {previews.front && (
        <button
          type="button"
          onClick={() => inputs.current.front?.click()}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Use a different selfie
        </button>
      )}

      {/* Optional angles */}
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Optional — add more angles for a fuller score
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {OPTIONAL_SLOTS.map((s) => {
            const preview = previews[s.key];
            return (
              <div key={s.key} className="relative">
                <button
                  type="button"
                  onClick={() => inputs.current[s.key]?.click()}
                  className={cn(
                    "flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-border bg-surface p-2 text-center transition-colors duration-150 hover:border-primary/50 active:scale-[0.98]",
                    preview && "border-solid border-primary/40",
                  )}
                >
                  {preview ? (
                    <img
                      src={preview}
                      alt={s.label}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">{s.label}</span>
                      <span className="text-[10px] leading-tight text-muted-foreground">
                        {s.hint}
                      </span>
                    </>
                  )}
                </button>
                {input(s.key, s.capture ?? "user")}
                {preview && (
                  <button
                    type="button"
                    aria-label={`Remove ${s.label} photo`}
                    onClick={() => void setSlot(s.key, null)}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-md"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
