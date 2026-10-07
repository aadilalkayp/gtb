import { useRef, useState } from "react";
import { ClipboardList, Download, ExternalLink, FileText, Image, Upload } from "lucide-react";
import {
  CONSULTATION_PLAN_LABELS,
  CONSULTATION_PLAN_TYPES,
  formatDate,
  humanize,
  isVersionedPlanType,
} from "@gtb/shared";
import { getDocumentUrl, uploadClientDocument } from "@/lib/api";
import { downloadAssessmentPdf, viewAssessmentPdf } from "@/lib/assessmentApi";
import { prettySize } from "@/components/DocumentRow";
import { Badge, Button, Field, Input, Modal, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface TimelineDocument {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  createdAt: Date | string;
  version: number | null;
  status: "active" | "superseded";
  description: string | null;
  uploadedBy?: { name: string } | null;
}

type Entry =
  | { kind: "assessment"; at: Date }
  | { kind: "document"; at: Date; doc: TimelineDocument };

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function docTitle(doc: TimelineDocument): string {
  if (!isVersionedPlanType(doc.type)) return humanize(doc.type);
  const base = CONSULTATION_PLAN_LABELS[doc.type];
  return doc.version && doc.version > 1 ? `Updated ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
}

function DocumentEntry({ doc }: { doc: TimelineDocument }) {
  const [opening, setOpening] = useState(false);
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(doc.fileName);
  const Icon = isImage ? Image : FileText;
  const versioned = isVersionedPlanType(doc.type);

  async function open() {
    setOpening(true);
    try {
      window.open(await getDocumentUrl(doc.id), "_blank", "noopener");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", doc.status === "superseded" && "opacity-70")}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">{docTitle(doc)}</p>
          {versioned && doc.version != null && <Badge tone="neutral">Version {doc.version}</Badge>}
          {versioned && (
            <Badge tone={doc.status === "active" ? "success" : "neutral"}>
              {doc.status === "active" ? "Active" : "Superseded"}
            </Badge>
          )}
        </div>
        {doc.description && <p className="mt-0.5 text-sm text-foreground/80">{doc.description}</p>}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {doc.uploadedBy?.name ? `Uploaded by ${doc.uploadedBy.name} · ` : ""}
          {doc.fileName} · {prettySize(doc.fileSize)}
        </p>
      </div>
      <Button size="sm" variant="ghost" loading={opening} onClick={() => void open()} aria-label={`Open ${doc.fileName}`}>
        <ExternalLink className="h-4 w-4" />
        <span className="hidden sm:inline">View</span>
      </Button>
    </div>
  );
}

function AssessmentEntry({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string>();
  async function run(kind: "view" | "download") {
    setError(undefined);
    setBusy(kind);
    try {
      if (kind === "view") await viewAssessmentPdf(clientId);
      else await downloadAssessmentPdf(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the PDF");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ClipboardList className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Pre-Consultation Assessment</p>
        <p className="mt-0.5 text-xs text-muted-foreground">System generated · internal</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" loading={busy === "view"} onClick={() => void run("view")}>
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">View</span>
        </Button>
        <Button size="sm" variant="ghost" loading={busy === "download"} onClick={() => void run("download")}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * The client's document history, newest first and grouped by day: the
 * system-generated Pre-Consultation Assessment, consultation plan versions
 * (active and superseded) and every other upload (spec §13).
 */
export function DocumentTimeline({
  clientId,
  documents,
  assessmentSubmittedAt,
  canUploadPlan,
  onUploadPlan,
  onUploadOther,
}: {
  clientId: string;
  documents: TimelineDocument[];
  /** Set when the viewer may see the assessment and it has been submitted. */
  assessmentSubmittedAt: Date | string | null;
  canUploadPlan: boolean;
  onUploadPlan: () => void;
  onUploadOther: () => void;
}) {
  const entries: Entry[] = [
    ...(assessmentSubmittedAt
      ? [{ kind: "assessment" as const, at: new Date(assessmentSubmittedAt) }]
      : []),
    ...documents.map((doc) => ({ kind: "document" as const, at: new Date(doc.createdAt), doc })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const days: { key: string; at: Date; items: Entry[] }[] = [];
  for (const e of entries) {
    const key = dayKey(e.at);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(e);
    else days.push({ key, at: e.at, items: [e] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {canUploadPlan && (
          <Button size="sm" onClick={onUploadPlan}>
            <Upload className="h-4 w-4" /> Upload Consultation Plan PDF
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onUploadOther}>
          <Upload className="h-4 w-4" /> Upload document
        </Button>
      </div>
      {days.length === 0 ? (
        <p className="card p-10 text-center text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ol className="space-y-4">
          {days.map((d) => (
            <li key={d.key}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDate(d.at)}
              </h3>
              <div className="card divide-y divide-border">
                {d.items.map((e) =>
                  e.kind === "assessment" ? (
                    <AssessmentEntry key="assessment" clientId={clientId} />
                  ) : (
                    <DocumentEntry key={e.doc.id} doc={e.doc} />
                  ),
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * "Upload Consultation Plan PDF" (spec §12): pick the plan, add an optional
 * title, choose the PDF. A newer upload supersedes the previous version and
 * keeps it in history.
 */
export function ConsultationPlanUploadModal({
  clientId,
  allowedTypes,
  onClose,
  onDone,
}: {
  clientId: string;
  allowedTypes: readonly (typeof CONSULTATION_PLAN_TYPES)[number][];
  onClose: () => void;
  onDone: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState(allowedTypes[0] ?? "skincare_plan");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!file) {
      setError("Choose the plan PDF to upload.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await uploadClientDocument({ clientId, type, file, description: description.trim() || undefined });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload Consultation Plan PDF"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Document type" htmlFor="plan-type" required>
          <Select id="plan-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {CONSULTATION_PLAN_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title or description" htmlFor="plan-description" hint="Optional, e.g. Week 1 to 4 routine">
          <Input
            id="plan-description"
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Plan PDF" required>
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            className="hidden"
            aria-label="Plan PDF"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setError(undefined);
              if (f && f.type !== "application/pdf") {
                setError("Please choose a PDF file.");
                return;
              }
              setFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border-[1.5px] border-dashed border-border-strong px-4 py-3 text-left text-sm transition-colors hover:border-primary/50"
          >
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {file ? file.name : "Choose a PDF"}
            </span>
            {file && <span className="text-xs text-muted-foreground">{prettySize(file.size)}</span>}
          </button>
        </Field>
        <p className="text-xs text-muted-foreground">
          If a plan of this type already exists, this becomes the new active version and the
          previous one stays in the document history.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
