import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Clock,
  Lock,
  MessageCircle,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import {
  MAX_EXTRA_PHOTOS,
  PHOTO_SLOT_LABELS,
  PHOTO_SLOT_TIPS,
  REQUIRED_PHOTO_SLOTS,
  formatDate,
  missingRequiredSlots,
  type StylingPhotoSlot,
} from "@gtb/shared";
import { getDocumentUrl } from "@/lib/api";
import {
  PORTAL_STYLING_KEY,
  removeStylingPhoto,
  submitStylingPhotos,
  toggleEssential,
  uploadStylingPhoto,
  usePortalStyling,
  type PortalPhoto,
  type PortalStyling as PortalStylingData,
} from "@/lib/stylingApi";
import { Button, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { BlueprintView } from "@/components/styling/BlueprintView";
import { ChatThread } from "@/components/chat/ChatThread";
import { useChatInbox } from "@/lib/chatApi";
import { cn } from "@/lib/utils";

type Ready = Extract<PortalStylingData, { enabled: true }>;

/**
 * Client Styling tab (STYLING_BLUEPRINT.md, screens C1 to C8): send photos,
 * wait while the stylist works (with retakes), then the published Blueprint.
 * Everything comes from /api/styling/portal; the client never sees drafts.
 */
export function PortalStyling() {
  const { data, isLoading, error, refetch } = usePortalStyling();
  const [updating, setUpdating] = useState(false);
  const [params, setParams] = useSearchParams();
  const chatOpen = params.get("chat") === "1";

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        icon={Scissors}
        title="Your Styling Blueprint couldn't load"
        hint="Check your connection and try again."
        action={<Button onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }
  if (!data.enabled) {
    return (
      <EmptyState
        icon={Scissors}
        title="Styling isn't part of your plan"
        hint="Ask your GTB coordinator if you'd like to add a personal styling service."
      />
    );
  }

  const archived = data.status === "archived";
  const stylistFirst = data.stylist?.name.split(" ")[0] ?? "Your stylist";
  const openChat = () => setParams({ chat: "1" });

  if (chatOpen) {
    return (
      <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] animate-fade-up flex-col gap-3 sm:h-[calc(100dvh-11rem)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setParams({})}
            aria-label="Back to your Styling Blueprint"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:border-border-strong"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-display">
              Ask {data.stylist ? stylistFirst : "your stylist"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Questions about your looks, sizes or shopping
            </p>
          </div>
        </div>
        <div className="card flex min-h-0 flex-1 flex-col p-3">
          <ChatThread kind="styling" className="min-h-0 flex-1" />
        </div>
      </div>
    );
  }

  // Published: the Blueprint is the page. A pending update shows on top.
  if (data.blueprint && !updating) {
    return (
      <div className="space-y-4">
        {data.status === "retake_requested" && (
          <RetakeCard data={data} stylistFirst={stylistFirst} />
        )}
        {data.status === "under_review" && (
          <StatusBanner icon={Clock} tone="info">
            {stylistFirst} is reviewing your new photos
            {data.dueAt ? `, expected by ${formatDate(data.dueAt)}` : ""}. Your current Blueprint
            stays here meanwhile.
          </StatusBanner>
        )}
        <PublishedView data={data} archived={archived} />
        <AskStylistCard stylistFirst={stylistFirst} onOpen={openChat} />
        {!archived && data.status === "published" && (
          <button
            type="button"
            onClick={() => setUpdating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Camera className="h-4 w-4" /> Send new photos (after a haircut or fitting)
          </button>
        )}
      </div>
    );
  }

  if (archived) {
    return (
      <EmptyState
        icon={Scissors}
        title="Your programme has ended"
        hint="No Styling Blueprint was published for this programme."
      />
    );
  }

  if (data.status === "retake_requested") {
    return (
      <div className="animate-fade-up space-y-4">
        <PageTitle subtitle="One photo needs retaking" />
        <RetakeCard data={data} stylistFirst={stylistFirst} />
        <PhotoStrip photos={data.photos} />
        <AskStylistCard stylistFirst={stylistFirst} onOpen={openChat} />
      </div>
    );
  }

  if (data.status === "under_review") {
    return (
      <div className="space-y-4">
        <UnderReview data={data} stylistFirst={stylistFirst} />
        <AskStylistCard stylistFirst={stylistFirst} onOpen={openChat} />
      </div>
    );
  }

  // Awaiting photos (first time), or a published client sending an update.
  return (
    <div className="space-y-4">
      <PhotoUploader
        data={data}
        stylistFirst={stylistFirst}
        isUpdate={Boolean(data.blueprint)}
        onCancel={updating ? () => setUpdating(false) : undefined}
        onSubmitted={() => setUpdating(false)}
      />
      {data.stylist && <AskStylistCard stylistFirst={stylistFirst} onOpen={openChat} />}
    </div>
  );
}

/** "Ask My Stylist": opens the conversation, with an unread count. */
function AskStylistCard({ stylistFirst, onOpen }: { stylistFirst: string; onOpen: () => void }) {
  const { data } = useChatInbox();
  const unread = data?.conversations.find((c) => c.kind === "styling")?.unread ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group flex w-full items-center gap-3 p-4 text-left transition-[box-shadow,border-color,transform] duration-150 ease-out-strong hover:border-border-strong hover:shadow-md active:scale-[0.99]"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          Ask {stylistFirst === "Your stylist" ? "my stylist" : stylistFirst}
        </span>
        <span className="block text-sm text-muted-foreground">
          {unread > 0
            ? `${unread} new ${unread === 1 ? "message" : "messages"}`
            : "Questions about your looks, sizes or shopping"}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function PageTitle({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-display">
        Your Styling Blueprint
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function StatusBanner({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Clock;
  tone: "info" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-card px-4 py-3 text-sm",
        tone === "info" ? "bg-info/10 text-info" : "bg-warning/10 text-warning",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-foreground">{children}</p>
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PORTAL_STYLING_KEY });
}

// ---- C1: send photos ----------------------------------------------------------------

function PhotoUploader({
  data,
  stylistFirst,
  isUpdate,
  onCancel,
  onSubmitted,
}: {
  data: Ready;
  stylistFirst: string;
  isUpdate: boolean;
  onCancel?: () => void;
  onSubmitted: () => void;
}) {
  const refresh = useRefresh();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const bySlot = new Map(data.photos.filter((p) => p.slot !== "extra").map((p) => [p.slot, p]));
  const extras = data.photos.filter((p) => p.slot === "extra");
  const missing = missingRequiredSlots(bySlot.keys());
  const done = REQUIRED_PHOTO_SLOTS.length - missing.length;

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    try {
      await submitStylingPhotos();
      await refresh();
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your photos");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <PageTitle
        subtitle={isUpdate ? "Send new photos for an update" : "Step 1 of 2 · Send your photos"}
      />
      <div className="card border-transparent bg-primary/[0.06] p-4 text-sm shadow-none">
        {isUpdate
          ? `Replace the photos that changed. ${stylistFirst} will update your Blueprint and your current one stays visible meanwhile.`
          : `${stylistFirst === "Your stylist" ? "Your stylist uses" : `${stylistFirst}, your stylist, uses`} these photos to prepare your hairstyle, beard and outfit recommendations.`}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Required photos</span>
          <span className="font-num text-muted-foreground">
            {done} of {REQUIRED_PHOTO_SLOTS.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(done / REQUIRED_PHOTO_SLOTS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {REQUIRED_PHOTO_SLOTS.map((slot) => (
          <SlotTile key={slot} slot={slot} photo={bySlot.get(slot)} onChanged={refresh} />
        ))}
        {extras.length < MAX_EXTRA_PHOTOS && <SlotTile slot="extra" onChanged={refresh} optional />}
      </div>

      {extras.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            Optional photos{" "}
            <span className="font-normal text-muted-foreground">
              ({extras.length} of {MAX_EXTRA_PHOTOS})
            </span>
          </p>
          <div className="grid grid-cols-4 gap-2">
            {extras.map((p) => (
              <ExtraTile key={p.id} photo={p} onChanged={refresh} />
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <p className="mb-1 text-sm font-semibold">For the best result</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          <li>Daylight, facing a window</li>
          <li>Plain wall behind you</li>
          <li>No cap or sunglasses</li>
          <li>Hair as you usually wear it</li>
        </ul>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Only your GTB styling team can see these photos.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={missing.length > 0}
          loading={submitting}
          onClick={() => void submit()}
        >
          {missing.length > 0
            ? `Add ${missing.length} more ${missing.length === 1 ? "photo" : "photos"} to submit`
            : isUpdate
              ? "Send new photos"
              : "Submit photos"}
        </Button>
      </div>
    </div>
  );
}

function useUpload(slot: StylingPhotoSlot, onChanged: () => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      await uploadStylingPhoto({ slot, file });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png"
      className="hidden"
      onChange={(e) => void onFile(e.target.files?.[0])}
    />
  );
  return { open: () => input.current?.click(), busy, error, picker };
}

function SlotTile({
  slot,
  photo,
  optional,
  onChanged,
}: {
  slot: StylingPhotoSlot;
  photo?: PortalPhoto;
  optional?: boolean;
  onChanged: () => void;
}) {
  const up = useUpload(slot, onChanged);
  const label = optional ? "Outfits, ideas" : PHOTO_SLOT_LABELS[slot];
  return (
    <div className="space-y-1 text-center">
      {up.picker}
      <button
        type="button"
        onClick={up.open}
        disabled={up.busy}
        title={PHOTO_SLOT_TIPS[slot]}
        aria-label={photo ? `Replace ${label} photo` : `Add ${label} photo`}
        className={cn(
          "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg transition-[border-color,transform] active:scale-[0.98]",
          photo?.url
            ? "bg-muted"
            : "border-[1.5px] border-dashed border-border-strong bg-surface text-muted-foreground hover:border-primary/50",
          photo?.retakeNote && "ring-2 ring-warning ring-offset-1",
        )}
      >
        {up.busy ? (
          <Spinner className="h-5 w-5" />
        ) : photo?.url ? (
          <>
            <img src={photo.url} alt={label} className="h-full w-full object-cover" />
            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
              <Check className="h-3 w-3" />
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs">
            {optional ? <Plus className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            {optional ? "Optional" : "Add"}
          </span>
        )}
      </button>
      <p className="text-xs text-muted-foreground">{label}</p>
      {up.error && <p className="text-[11px] text-danger">{up.error}</p>}
    </div>
  );
}

function ExtraTile({ photo, onChanged }: { photo: PortalPhoto; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
      {photo.url && (
        <img src={photo.url} alt="Optional photo" className="h-full w-full object-cover" />
      )}
      <button
        type="button"
        aria-label="Remove photo"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await removeStylingPhoto(photo.id);
            await onChanged();
          } finally {
            setBusy(false);
          }
        }}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-sm"
      >
        {busy ? <Spinner className="h-3 w-3" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ---- C2: under review -----------------------------------------------------------------

function UnderReview({ data, stylistFirst }: { data: Ready; stylistFirst: string }) {
  const [replacing, setReplacing] = useState(false);
  const refresh = useRefresh();
  return (
    <div className="animate-fade-up space-y-4">
      <PageTitle subtitle="Step 2 of 2 · Your stylist is on it" />
      <div className="card space-y-1.5 border-transparent bg-primary/[0.06] p-4 shadow-none">
        <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-semibold text-info">
          <Clock className="h-3 w-3" /> Under review
        </span>
        <p className="font-semibold">{stylistFirst} is preparing your Blueprint</p>
        <p className="text-sm text-muted-foreground">
          {data.dueAt ? `Expected by ${formatDate(data.dueAt)}. ` : ""}We'll notify you when it's
          ready.
        </p>
      </div>
      <div className="card grid grid-cols-3 gap-2 p-4 text-center text-xs">
        <Step
          done
          label="Photos sent"
          sub={data.photosSubmittedAt ? formatDate(data.photosSubmittedAt) : undefined}
          icon={Check}
        />
        <Step current label="Stylist working" icon={Scissors} />
        <Step label="Blueprint ready" icon={Sparkles} />
      </div>
      {replacing ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Tap a photo to replace it</p>
          <div className="grid grid-cols-3 gap-2.5">
            {REQUIRED_PHOTO_SLOTS.map((slot) => (
              <SlotTile
                key={slot}
                slot={slot}
                photo={data.photos.find((p) => p.slot === slot)}
                onChanged={refresh}
              />
            ))}
          </div>
          <Button variant="outline" className="w-full" onClick={() => setReplacing(false)}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <PhotoStrip photos={data.photos} />
          <Button variant="outline" className="w-full" onClick={() => setReplacing(true)}>
            <RefreshCw className="h-4 w-4" /> Replace a photo
          </Button>
        </>
      )}
    </div>
  );
}

function Step({
  label,
  sub,
  icon: Icon,
  done,
  current,
}: {
  label: string;
  sub?: string;
  icon: typeof Check;
  done?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5",
        current ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border-[1.5px]",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : current
              ? "border-primary text-primary"
              : "border-border-strong",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      {label}
      {sub && <span className="font-num font-normal">{sub}</span>}
    </div>
  );
}

function PhotoStrip({ photos }: { photos: PortalPhoto[] }) {
  if (!photos.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Photos you sent</span>
        <span className="text-muted-foreground">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {photos.map((p) => (
          <div key={p.id} className="aspect-[3/4] overflow-hidden rounded-md bg-muted">
            {p.url && (
              <img
                src={p.url}
                alt={PHOTO_SLOT_LABELS[p.slot]}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- C3: retake requested -----------------------------------------------------------

function RetakeCard({ data, stylistFirst }: { data: Ready; stylistFirst: string }) {
  const refresh = useRefresh();
  const flagged = data.photos.filter((p) => p.retakeNote);
  return (
    <div className="space-y-3">
      <div className="card space-y-1.5 border-transparent bg-warning/10 p-4 shadow-none">
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
          <Camera className="h-3 w-3" /> Retake requested
        </span>
        <p className="font-semibold">
          {stylistFirst} needs{" "}
          {flagged.length === 1 ? "one new photo" : `${flagged.length} new photos`}
        </p>
        <p className="text-sm text-muted-foreground">
          Everything else is fine. Work continues while you retake.
        </p>
      </div>
      {flagged.map((p) => (
        <RetakeRow key={p.id} photo={p} stylistFirst={stylistFirst} onChanged={refresh} />
      ))}
    </div>
  );
}

function RetakeRow({
  photo,
  stylistFirst,
  onChanged,
}: {
  photo: PortalPhoto;
  stylistFirst: string;
  onChanged: () => void;
}) {
  const up = useUpload(photo.slot, onChanged);
  return (
    <div className="card grid grid-cols-[96px_1fr] gap-3 p-3">
      {up.picker}
      <div className="aspect-[3/4] overflow-hidden rounded-lg bg-muted ring-2 ring-warning ring-offset-1">
        {photo.url && (
          <img
            src={photo.url}
            alt={PHOTO_SLOT_LABELS[photo.slot]}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">{PHOTO_SLOT_LABELS[photo.slot]}</p>
        <p className="border-l-2 border-primary pl-2 text-sm italic">"{photo.retakeNote}"</p>
        {photo.retakeRequestedAt && (
          <p className="text-xs text-muted-foreground">
            {stylistFirst} · {formatDate(photo.retakeRequestedAt)}
          </p>
        )}
        <Button size="sm" onClick={up.open} loading={up.busy}>
          <Camera className="h-4 w-4" /> Retake photo
        </Button>
        {up.error && <p className="text-xs text-danger">{up.error}</p>}
      </div>
    </div>
  );
}

// ---- C4 to C8: published -------------------------------------------------------------

function PublishedView({ data, archived }: { data: Ready; archived: boolean }) {
  const qc = useQueryClient();
  const [pdfLoading, setPdfLoading] = useState(false);
  const bp = data.blueprint!;

  async function openPdf() {
    if (!bp.pdfDocumentId) return;
    setPdfLoading(true);
    // Open synchronously so mobile browsers don't block the new tab.
    const tab = window.open("", "_blank");
    try {
      const url = await getDocumentUrl(bp.pdfDocumentId);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      tab?.close();
    } finally {
      setPdfLoading(false);
    }
  }

  async function onToggle(id: string, checked: boolean) {
    qc.setQueryData<PortalStylingData>(PORTAL_STYLING_KEY, (old) => {
      if (!old?.enabled || !old.blueprint) return old;
      const set = new Set(old.blueprint.checkedEssentialIds);
      if (checked) set.add(id);
      else set.delete(id);
      return { ...old, blueprint: { ...old.blueprint, checkedEssentialIds: [...set] } };
    });
    try {
      await toggleEssential(id, checked);
    } catch {
      await qc.invalidateQueries({ queryKey: PORTAL_STYLING_KEY });
    }
  }

  return (
    <BlueprintView
      snapshot={bp.snapshot}
      images={bp.images}
      stylistName={data.stylist?.name}
      publishedAt={bp.publishedAt}
      checkedEssentialIds={bp.checkedEssentialIds}
      onToggleEssential={archived ? undefined : (id, c) => void onToggle(id, c)}
      onDownloadPdf={bp.pdfDocumentId ? () => void openPdf() : undefined}
      pdfLoading={pdfLoading}
    />
  );
}
