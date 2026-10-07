import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  Download,
  Eye,
  FileText,
  ImageOff,
  RefreshCw,
  Send,
  Undo2,
} from "lucide-react";
import {
  BLUEPRINT_SECTIONS,
  BLUEPRINT_SECTION_LABELS,
  PHOTO_SLOT_LABELS,
  REQUIRED_PHOTO_SLOTS,
  blueprintCompletion,
  blueprintDisplayStatus,
  daysUntil,
  emptySections,
  formatDate,
  isBlueprintLate,
  snapshotSectionHasContent,
  type BlueprintSection,
  type BlueprintSnapshot,
  type BlueprintStatus,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { getDocumentUrl } from "@/lib/api";
import {
  cancelRetake,
  downloadPhotosZip,
  publishBlueprint,
  regenerateBlueprintPdf,
  requestRetake,
  sendPhotoReminder,
  type StaffPhoto,
} from "@/lib/stylingApi";
import { Badge, Button, Field, Modal, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { BlueprintView } from "@/components/styling/BlueprintView";
import { ChatThread } from "@/components/chat/ChatThread";
import { cn } from "@/lib/utils";
import { PaymentClearanceBadge, useStylingPaymentStatus } from "../paymentClearance";
import { SectionEditor } from "./SectionEditors";
import { useBlueprint } from "./useBlueprint";

/**
 * Client profile, Styling tab (screens S2 to S4): the client's photos to
 * download or send back for a retake, the ten Blueprint sections, preview of
 * the exact client view, and publish. Admins and the client's stylist edit;
 * other assigned staff see it read-only.
 */
export function BlueprintTab({ clientId }: { clientId: string }) {
  const { user, role } = useAuth();
  const data = useBlueprint(clientId);
  const { data: paymentStatus } = useStylingPaymentStatus();
  const [editing, setEditing] = useState<BlueprintSection | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [retakeFor, setRetakeFor] = useState<StaffPhoto | null>(null);
  const [notice, setNotice] = useState<string>();

  const { bp, draft, latest, media } = data;
  if (data.query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (!bp || !draft) {
    return (
      <EmptyState
        title="No Styling Blueprint yet"
        hint="It's created when a stylist is assigned to this client."
      />
    );
  }

  const isAdmin = role === "founder" || role === "ops_head";
  const isStylist = bp.client.assignments.some((a) => a.staffId === user?.id);
  const status = blueprintDisplayStatus(bp.status as BlueprintStatus, bp.client.status);
  const archived = status === "archived";
  const canEdit = (isAdmin || isStylist) && !archived;
  const completion = blueprintCompletion(bp.sectionsDone);
  const stylist = bp.client.assignments[0]?.staff.name ?? null;
  const late =
    (bp.status === "under_review" || bp.status === "retake_requested") && isBlueprintLate(bp.dueAt);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Styling Blueprint</h2>
            <StatusBadge status={status} />
            {data.hasDraftChanges && <Badge tone="warning">Draft changes</Badge>}
            {late && <Badge tone="danger">Late</Badge>}
            <PaymentClearanceBadge status={paymentStatus?.[clientId]} />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{bp.client.clientPlan?.planNameSnapshot ?? "No plan"}</span>
            <span>
              Big day {formatDate(bp.client.weddingDate)} ·{" "}
              {Math.max(0, daysUntil(bp.client.weddingDate))} days
            </span>
            <span>Stylist: {stylist ?? "Not assigned"}</span>
            {bp.photosSubmittedAt && <span>Photos sent {formatDate(bp.photosSubmittedAt)}</span>}
            {bp.dueAt && (bp.status === "under_review" || bp.status === "retake_requested") && (
              <span className={cn(late && "font-semibold text-danger")}>
                Due {formatDate(bp.dueAt)}
              </span>
            )}
            {latest && (
              <span>
                Version {latest.version} published {formatDate(latest.createdAt)}
                {latest.publishedBy ? ` by ${latest.publishedBy.name}` : ""}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${completion.ratio * 100}%` }}
              />
            </div>
            <span className="font-num text-xs text-muted-foreground">
              {completion.done} of {completion.total} sections done
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest?.pdfDocumentId && <PdfButton documentId={latest.pdfDocumentId} />}
          {latest && !latest.pdfDocumentId && canEdit && (
            <RegeneratePdfButton clientId={clientId} onDone={() => void data.query.refetch()} />
          )}
          <Button variant="outline" size="sm" onClick={() => setPreviewing(true)}>
            <Eye className="h-4 w-4" /> Preview client view
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setConfirming(true)} disabled={!bp.photosSubmittedAt}>
              <Send className="h-4 w-4" /> {latest ? "Publish update" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <p className="rounded-lg bg-success/10 px-4 py-2.5 text-sm text-success" role="status">
          {notice}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[360px_1fr]">
        <PhotosPanel
          clientId={clientId}
          clientCode={bp.client.clientCode}
          clientName={bp.client.name.split(" ")[0] ?? bp.client.name}
          status={bp.status as BlueprintStatus}
          photos={media.data?.photos ?? []}
          loading={media.isLoading}
          canEdit={canEdit}
          onRetake={setRetakeFor}
          onChanged={async () => {
            await data.refreshMedia();
            await data.query.refetch();
          }}
          onNotice={setNotice}
        />

        <div className="card p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Blueprint sections</h3>
            {!canEdit && <span className="text-xs text-muted-foreground">Read-only</span>}
          </div>
          <SectionList draft={draft} sectionsDone={bp.sectionsDone} onOpen={setEditing} />
        </div>
      </div>

      {/* Chat is between the client and their stylist; admins read along. */}
      {(isAdmin || isStylist) && (
        <section className="card flex flex-col p-4" aria-label="Messages">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Messages with {bp.client.name.split(" ")[0]}</h3>
            <span className="text-xs text-muted-foreground">Updates every few seconds</span>
          </div>
          <ChatThread kind="styling" clientId={clientId} className="h-[440px]" />
        </section>
      )}

      {editing && (
        <SectionEditor
          section={editing}
          clientId={clientId}
          data={data}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {previewing && (
        <Modal open onClose={() => setPreviewing(false)} title="Preview client view" size="md">
          <p className="mb-4 rounded-lg bg-foreground px-3 py-2 text-xs text-surface">
            This is exactly what {bp.client.name.split(" ")[0]} will see once you publish. Empty
            sections are hidden.
          </p>
          <BlueprintView snapshot={draft} images={data.images} stylistName={stylist} />
        </Modal>
      )}

      {confirming && (
        <PublishModal
          clientId={clientId}
          clientFirstName={bp.client.name.split(" ")[0] ?? bp.client.name}
          draft={draft}
          isUpdate={Boolean(latest)}
          onClose={() => setConfirming(false)}
          onPublished={(msg) => {
            setConfirming(false);
            setNotice(msg);
            void data.query.refetch();
          }}
        />
      )}

      {retakeFor && (
        <RetakeModal
          photo={retakeFor}
          onClose={() => setRetakeFor(null)}
          onDone={async () => {
            setRetakeFor(null);
            await data.refreshMedia();
            await data.query.refetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Photos -----------------------------------------------------------------------

function PhotosPanel({
  clientId,
  clientCode,
  clientName,
  status,
  photos,
  loading,
  canEdit,
  onRetake,
  onChanged,
  onNotice,
}: {
  clientId: string;
  clientCode: string;
  clientName: string;
  status: BlueprintStatus;
  photos: StaffPhoto[];
  loading: boolean;
  canEdit: boolean;
  onRetake: (p: StaffPhoto) => void;
  onChanged: () => Promise<void>;
  onNotice: (msg: string) => void;
}) {
  const [zipping, setZipping] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [error, setError] = useState<string>();
  const ordered = [
    ...REQUIRED_PHOTO_SLOTS.map((slot) => photos.find((p) => p.slot === slot)).filter(
      (p): p is StaffPhoto => Boolean(p),
    ),
    ...photos.filter((p) => p.slot === "extra"),
  ];
  const submitted = status !== "awaiting_photos";
  // Retakes only while a submission is being reviewed.
  const inReview = status === "under_review" || status === "retake_requested";

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Client photos</h3>
          <p className="text-xs text-muted-foreground">
            {submitted ? `${ordered.length} photos` : `Waiting for ${clientName} to send photos`}
          </p>
        </div>
        {ordered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            loading={zipping}
            onClick={async () => {
              setZipping(true);
              setError(undefined);
              try {
                await downloadPhotosZip(clientId, clientCode);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Download failed");
              } finally {
                setZipping(false);
              }
            }}
          >
            <Download className="h-4 w-4" /> Download all
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No photos yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {ordered.map((p) => (
            <PhotoCell
              key={p.id}
              photo={p}
              canEdit={canEdit && inReview}
              onRetake={onRetake}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      {status === "awaiting_photos" && canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          loading={reminding}
          onClick={async () => {
            setReminding(true);
            setError(undefined);
            try {
              const r = await sendPhotoReminder(clientId);
              onNotice(
                r.sent ? `Reminder sent to ${clientName}.` : "A reminder already went out today.",
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not send the reminder");
            } finally {
              setReminding(false);
            }
          }}
        >
          <Bell className="h-4 w-4" /> Send reminder
        </Button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Edit the photos in your own tools, then upload the edited versions inside each section.
        Delete local copies once the Blueprint is published.
      </p>
    </div>
  );
}

function PhotoCell({
  photo,
  canEdit,
  onRetake,
  onChanged,
}: {
  photo: StaffPhoto;
  canEdit: boolean;
  onRetake: (p: StaffPhoto) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const label = PHOTO_SLOT_LABELS[photo.slot];
  return (
    <div className="space-y-1 text-[11px]">
      <a
        href={photo.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "block aspect-[3/4] overflow-hidden rounded-lg bg-muted",
          photo.retakeNote && "ring-2 ring-warning ring-offset-1",
        )}
      >
        {photo.url ? (
          <img src={photo.url} alt={label} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" />
          </span>
        )}
      </a>
      <p className="truncate font-medium">{photo.slot === "extra" ? "Optional" : label}</p>
      <div className="flex items-center justify-between text-muted-foreground">
        {photo.downloadUrl ? (
          <a
            href={photo.downloadUrl}
            className="flex items-center gap-0.5 hover:text-foreground"
            aria-label={`Download ${label}`}
          >
            <Download className="h-3 w-3" />
          </a>
        ) : (
          <span />
        )}
        {canEdit &&
          photo.slot !== "extra" &&
          (photo.retakeNote ? (
            <button
              type="button"
              disabled={busy}
              className="flex items-center gap-0.5 text-warning hover:underline"
              onClick={async () => {
                setBusy(true);
                try {
                  await cancelRetake(photo.id);
                  await onChanged();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Undo2 className="h-3 w-3" /> Undo retake
            </button>
          ) : (
            <button
              type="button"
              className="hover:text-foreground hover:underline"
              onClick={() => onRetake(photo)}
            >
              Retake
            </button>
          ))}
      </div>
      {photo.retakeNote && <p className="line-clamp-2 text-warning">{photo.retakeNote}</p>}
    </div>
  );
}

function RetakeModal({
  photo,
  onClose,
  onDone,
}: {
  photo: StaffPhoto;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Modal
      open
      onClose={onClose}
      title={`Ask for a new ${PHOTO_SLOT_LABELS[photo.slot].toLowerCase()} photo`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!note.trim()}
            onClick={async () => {
              setSaving(true);
              setError(undefined);
              try {
                await requestRetake(photo.id, note.trim());
                await onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not send the request");
                setSaving(false);
              }
            }}
          >
            Request retake
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {photo.url && <img src={photo.url} alt="" className="mx-auto max-h-56 rounded-lg" />}
        <Field
          label="What should the client change?"
          hint="The client sees this note with the photo."
          required
        >
          <Textarea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="It's a little dark. Please retake it near a window in daylight."
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

// ---- Sections --------------------------------------------------------------------

function sectionSummary(section: BlueprintSection, s: BlueprintSnapshot): string {
  const count = (n: number, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : "Nothing added yet";
  const items = (k: string) => s.items.filter((i) => i.kind === k).length;
  switch (section) {
    case "profile":
      return (
        [s.profile.faceShape, s.profile.skinTone, s.profile.hairType, s.profile.beardType]
          .filter(Boolean)
          .join(", ") || "Nothing added yet"
      );
    case "direction":
      return (
        s.direction.tags.join(", ") ||
        (s.direction.description ? "Description only" : "Nothing added yet")
      );
    case "looks":
      return count(s.looks.length, "look", "looks");
    case "hair": {
      const shots = [s.hair.frontDocId, s.hair.sideDocId, s.hair.backDocId].filter(Boolean).length;
      return shots || s.hair.barberBrief.length
        ? `${shots} of 3 edited photos, ${s.hair.barberBrief.length} brief ${s.hair.barberBrief.length === 1 ? "line" : "lines"}`
        : "Nothing added yet";
    }
    case "colours":
      return count(s.palettes.length, "combination", "combinations");
    case "outfits":
      return count(items("outfit"), "outfit", "outfits");
    case "shopping":
      return count(items("product"), "item", "items");
    case "footwear":
      return count(items("footwear"), "pair", "pairs");
    case "eyewear":
      return count(items("eyewear"), "frame", "frames");
    case "essentials":
      return count(s.essentials.length, "item", "items");
  }
}

function SectionList({
  draft,
  sectionsDone,
  onOpen,
}: {
  draft: BlueprintSnapshot;
  sectionsDone: string[];
  onOpen: (s: BlueprintSection) => void;
}) {
  const has = snapshotSectionHasContent(draft);
  return (
    <div className="divide-y divide-border">
      {BLUEPRINT_SECTIONS.map((section) => {
        const done = sectionsDone.includes(section);
        return (
          <button
            key={section}
            type="button"
            onClick={() => onOpen(section)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{BLUEPRINT_SECTION_LABELS[section]}</p>
              <p className="truncate text-xs text-muted-foreground">
                {sectionSummary(section, draft)}
              </p>
            </div>
            {done ? (
              <Badge tone="success">Done</Badge>
            ) : has[section] ? (
              <Badge tone="warning">In progress</Badge>
            ) : (
              <Badge>Empty</Badge>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

// ---- Publish, PDF ------------------------------------------------------------------

function PublishModal({
  clientId,
  clientFirstName,
  draft,
  isUpdate,
  onClose,
  onPublished,
}: {
  clientId: string;
  clientFirstName: string;
  draft: BlueprintSnapshot;
  isUpdate: boolean;
  onClose: () => void;
  onPublished: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const empty = emptySections(draft);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Publish ${clientFirstName}'s Styling Blueprint?`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={empty.length === BLUEPRINT_SECTIONS.length}
            onClick={async () => {
              setSaving(true);
              setError(undefined);
              try {
                const r = await publishBlueprint(clientId);
                onPublished(
                  `Version ${r.version} published. ${clientFirstName} has been notified.${r.pdf ? "" : " The PDF couldn't be created; use Create PDF to try again."}`,
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not publish");
                setSaving(false);
              }
            }}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{clientFirstName} gets a notification in the portal and by email.</li>
          <li>The PDF is created from this version.</li>
          <li>
            Later changes stay as a draft until you publish again.
            {isUpdate ? " This replaces what the client sees now." : ""}
          </li>
        </ul>
        {empty.length > 0 && empty.length < BLUEPRINT_SECTIONS.length && (
          <div className="flex gap-2 rounded-lg bg-warning/10 p-3 text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-foreground">
              <span className="font-semibold">
                {empty.length} {empty.length === 1 ? "section is" : "sections are"} empty:
              </span>{" "}
              {empty.map((s) => BLUEPRINT_SECTION_LABELS[s]).join(", ")}.{" "}
              {empty.length === 1 ? "It'll" : "They'll"} be hidden from {clientFirstName}.
            </p>
          </div>
        )}
        {empty.length === BLUEPRINT_SECTIONS.length && (
          <p className="text-danger">Add some recommendations before publishing.</p>
        )}
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function PdfButton({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const tab = window.open("", "_blank");
        try {
          const url = await getDocumentUrl(documentId);
          if (tab) tab.location.href = url;
        } catch {
          tab?.close();
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileText className="h-4 w-4" /> PDF
    </Button>
  );
}

function RegeneratePdfButton({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await regenerateBlueprintPdf(clientId);
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "PDF failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw className="h-4 w-4" /> Create PDF
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
