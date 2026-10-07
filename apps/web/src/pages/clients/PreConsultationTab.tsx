import { useState } from "react";
import { Download, ExternalLink, FileText, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { SKIN_PHOTO_ANGLE_LABELS, formatDate, preConsultLabel } from "@gtb/shared";
import { prettySize } from "@/components/DocumentRow";
import { Badge, Button, Modal, Spinner } from "@/components/ui";
import { QueryErrorState } from "@/components/QueryErrorState";
import {
  downloadAssessmentPdf,
  reopenAssessment,
  useAssessment,
  viewAssessmentPdf,
  type AssessmentRecord,
  type SkinPhoto,
} from "@/lib/assessmentApi";

function dateTime(d: string | Date): string {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function yesNo(flag: boolean | null | undefined, details: string | null | undefined): string {
  if (flag == null) return "Not answered";
  return flag ? `Yes: ${details ?? ""}`.replace(/: $/, "") : "No";
}

function withOther(value: string | null | undefined, other: string | null | undefined): string {
  if (!value) return "Not answered";
  return value === "other" && other ? `Other: ${other}` : preConsultLabel(value);
}

function Answers({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="mt-3 divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium">{value || "Not provided"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PhotoCard({ photo }: { photo: SkinPhoto }) {
  return (
    <figure className="min-w-0">
      <a
        href={photo.originalUrl ?? photo.previewUrl ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-muted"
        aria-label={`Open the original ${SKIN_PHOTO_ANGLE_LABELS[photo.angle].toLowerCase()} photo`}
      >
        {photo.previewUrl && (
          <img
            src={photo.previewUrl}
            alt={SKIN_PHOTO_ANGLE_LABELS[photo.angle]}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100">
          <ExternalLink className="h-3 w-3" /> Original
        </span>
      </a>
      <figcaption className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-wide">
          {SKIN_PHOTO_ANGLE_LABELS[photo.angle]}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={photo.fileName}>
          {photo.fileName} · {prettySize(photo.fileSize)}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * Staff view of the Pre-Consultation Assessment: answers, the three skin
 * photos (originals one click away) and the generated PDF. Older clients who
 * filled the earlier onboarding form see `legacy` instead.
 */
export function PreConsultationTab({
  clientId,
  isAdmin,
  legacy,
}: {
  clientId: string;
  isAdmin: boolean;
  legacy: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAssessment(clientId);
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [reopening, setReopening] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) return <QueryErrorState message={error?.message} onRetry={() => void refetch()} />;

  const a: AssessmentRecord | null = data.assessment;
  if (!a?.submittedAt) {
    if (a?.reopenedAt) {
      return (
        <p className="card p-10 text-center text-sm text-muted-foreground">
          Reopened on {formatDate(a.reopenedAt)}. Waiting for the client to update and resubmit
          their pre-consultation assessment.
        </p>
      );
    }
    if (a?.completedAt && legacy) return <>{legacy}</>;
    return (
      <p className="card p-10 text-center text-sm text-muted-foreground">
        The client hasn't submitted their pre-consultation assessment yet.
      </p>
    );
  }

  async function run(kind: "view" | "download") {
    setActionError(undefined);
    setBusy(kind);
    try {
      if (kind === "view") await viewAssessmentPdf(clientId);
      else await downloadAssessmentPdf(clientId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not open the PDF");
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    setReopening(true);
    try {
      await reopenAssessment(clientId);
      await queryClient.invalidateQueries({ queryKey: ["assessment"] });
      setConfirmReopen(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not reopen the assessment");
      setConfirmReopen(false);
    } finally {
      setReopening(false);
    }
  }

  const concerns = (a.skinConcerns ?? [])
    .map((c) => (c === "other" && a.skinConcernOther ? `Other: ${a.skinConcernOther}` : preConsultLabel(c)))
    .join(", ");

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Pre-Consultation Assessment</h3>
            <Badge tone="success">Submitted</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Submitted {dateTime(a.submittedAt)} · PDF generated from the client's answers
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={busy === "view"} onClick={() => void run("view")}>
            <ExternalLink className="h-4 w-4" /> View PDF
          </Button>
          <Button size="sm" loading={busy === "download"} onClick={() => void run("download")}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmReopen(true)}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          )}
        </div>
      </div>
      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <div className="card p-5">
        <h3 className="text-sm font-semibold">Skin assessment photos</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Click a photo to open the original, full-resolution upload.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
          {data.photos.map((p) => (
            <PhotoCard key={p.angle} photo={p} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Answers
          title="Skincare"
          rows={[
            ["Skin type", preConsultLabel(a.skinType)],
            ["Current skin concerns", concerns],
            ["Current skincare routine", a.skincareRoutine ?? ""],
            ["Skin allergies / product reactions", yesNo(a.skinAllergyFlag, a.allergies)],
            ["Current dermatological treatment", yesNo(a.dermTreatmentFlag, a.dermatologicalNotes)],
          ]}
        />
        <div className="space-y-4">
          <Answers
            title="Fitness"
            rows={[
              ["Activity level", preConsultLabel(a.activityLevel)],
              ["Primary goal", withOther(a.fitnessGoal, a.fitnessGoalOther)],
              ["Height", a.heightCm != null ? `${a.heightCm} cm` : ""],
              ["Weight", a.weightKg != null ? `${a.weightKg} kg` : ""],
              ["Injury / medical condition", yesNo(a.healthConditionFlag, a.healthConditions)],
            ]}
          />
          <Answers
            title="Nutrition"
            rows={[
              ["Dietary preference", withOther(a.dietaryPreference, a.dietaryPreferenceOther)],
              ["Food allergies / restrictions", a.dietaryRestrictions ?? "None mentioned"],
            ]}
          />
        </div>
      </div>

      <Answers
        title="Consent"
        rows={[
          ["Information is accurate", a.consentAccuracy ? "Confirmed" : "Not confirmed"],
          ["Reviewed by GTB professionals", a.consentProfessionalReview ? "Confirmed" : "Not confirmed"],
        ]}
      />

      <Modal
        open={confirmReopen}
        onClose={() => setConfirmReopen(false)}
        title="Reopen the assessment?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReopen(false)}>
              Cancel
            </Button>
            <Button loading={reopening} onClick={() => void reopen()}>
              Reopen
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          The client is asked to update their answers or photos and submit again. Their current
          answers stay as the starting point. The PDF is unavailable until they resubmit.
        </p>
      </Modal>
    </div>
  );
}
