import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  formatINR,
  formatDate,
  SERVICE_TYPE_LABELS,
  preConsultLabel,
} from "@gtb/shared";
import { submitPayment } from "@/lib/api";
import { milestonePaces, planPace, type PlanPaymentLite } from "@/lib/insights";
import { Badge, Button, Input } from "@/components/ui";
import { FileUploadField } from "@/components/FileUploadField";
import { cn } from "@/lib/utils";
import type { UploadedDocument } from "@/lib/api";

interface AssessmentSummary {
  skinType: string | null;
  activityLevel: string | null;
  fitnessGoal: string | null;
  submittedAt: Date | string | null;
}

interface ReviewPlan {
  planNameSnapshot: string;
  durationMonths: number;
  plan: { services: { id: string; serviceType: string; totalSessions: number }[] };
}

/**
 * Last onboarding step: review what was chosen (with a way back to each
 * step), then submit the first payment. Submitting is the one step that
 * can't be undone from the wizard, so the review sits right above it.
 *
 * Fees are negotiated personally, so there's usually no price on file yet:
 * the client tells us what they paid and staff verify it against the proof.
 * If the coordinator already recorded the agreed price and schedule, they're
 * shown and the amount is capped at the balance.
 */
export function PaymentStep({
  client,
  assessment,
  clientPlan,
  onEdit,
  onDone,
}: {
  client: { id: string; leadPhase: string };
  assessment: AssessmentSummary | null;
  clientPlan: PlanPaymentLite & ReviewPlan;
  onEdit: (step: "assessment" | "plan") => void;
  onDone: () => void | Promise<void>;
}) {
  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const pace = useMemo(() => planPace(clientPlan), [clientPlan]);
  const paces = useMemo(() => milestonePaces(clientPlan), [clientPlan]);
  const underReview = clientPlan.payments
    .filter((p) => p.status === "pending_review")
    .reduce((t, p) => t + p.amount, 0);
  // Null = no ceiling (price not agreed yet).
  const submittable = pace.balance == null ? null : Math.max(pace.balance - underReview, 0);
  // With a schedule on file, the first milestone is the expected down payment.
  const suggested =
    submittable == null ? null : Math.min(pace.nextDue?.remaining ?? submittable, submittable);
  const [amount, setAmount] = useState(suggested == null ? "" : String(suggested));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    const value = Number(amount);
    if (!amount || !Number.isInteger(value) || value <= 0) {
      setError("Enter the amount you paid, as a whole number.");
      return;
    }
    if (submittable != null && value > submittable) {
      setError(`You can submit at most ${formatINR(submittable)}.`);
      return;
    }
    if (!doc) return;
    setSubmitting(true);
    setError(undefined);
    try {
      // STATE-6: payment submission + leadPhase advance are atomic server-side.
      await submitPayment(value, doc.id);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your payment");
      setSubmitting(false);
    }
  }

  const assessmentBits = assessment
    ? [
        assessment.skinType && `${preConsultLabel(assessment.skinType)} skin`,
        assessment.activityLevel && preConsultLabel(assessment.activityLevel),
        assessment.fitnessGoal && preConsultLabel(assessment.fitnessGoal),
        assessment.submittedAt && "3 skin photos",
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-5">
      {/* Review: everything chosen so far, each editable until the payment goes in. */}
      <section className="card divide-y divide-border">
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold">Review your details</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You can still change these. Once your payment is submitted, your team takes it from
            there.
          </p>
        </div>
        <ReviewRow
          label="Pre-consultation assessment"
          value="Submitted"
          detail={assessmentBits.join(" · ") || undefined}
          action="Edit"
          onAction={() => onEdit("assessment")}
        />
        <ReviewRow
          label="Plan"
          value={clientPlan.planNameSnapshot}
          detail={`${clientPlan.durationMonths} ${clientPlan.durationMonths === 1 ? "month" : "months"}`}
          action="Change"
          onAction={() => onEdit("plan")}
        >
          {clientPlan.plan.services.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {clientPlan.plan.services.map((s) => (
                <Badge key={s.id} tone="info">
                  {label(SERVICE_TYPE_LABELS, s.serviceType)} ×{s.totalSessions}
                </Badge>
              ))}
            </div>
          )}
        </ReviewRow>
        {clientPlan.agreedPrice != null && (
          <ReviewRow
            label="Agreed price"
            value={formatINR(clientPlan.agreedPrice)}
            detail="As confirmed with your coordinator"
          />
        )}
      </section>

      {paces.length > 0 && (
        <div className="card divide-y divide-border">
          {paces.map((p, i) => {
            const isFirst = i === 0;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between px-4 py-3",
                  isFirst && p.status !== "paid" && "bg-primary/5",
                )}
              >
                <div>
                  <p className="text-sm font-medium">
                    {isFirst ? "First payment" : `Milestone ${i + 1}`}
                    {paces.length > 1 && ` of ${paces.length}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expected by {formatDate(p.milestone.dueDate)}
                  </p>
                </div>
                <span className="font-num text-sm font-semibold">
                  {formatINR(p.milestone.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {submittable == null || submittable > 0 ? (
        <div className="card space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">Submit your first payment</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {clientPlan.agreedPrice == null
                ? "Pay the amount you agreed with your coordinator via UPI, bank transfer, or cash. Then tell us how much you paid and add a screenshot or receipt. Your CRO will verify it to activate your program."
                : "Pay via UPI, bank transfer, or cash, then enter the amount with a screenshot or receipt. Your CRO will verify it to activate your program. You can pay the rest in parts, any amounts, as you go."}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Amount paid (₹)</p>
            <Input
              type="number"
              min={1}
              max={submittable ?? undefined}
              value={amount}
              placeholder="e.g. 25000"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <FileUploadField
            clientId={client.id}
            type="payment_proof"
            label="Upload payment proof"
            onUploaded={setDoc}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <div className="card p-6 text-center text-sm text-muted-foreground">
          Your payment has been submitted and is awaiting review.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="lg" onClick={() => onEdit("plan")} disabled={submitting}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {(submittable == null || submittable > 0) && (
          <Button size="lg" disabled={!doc} loading={submitting} onClick={submit}>
            Submit payment
          </Button>
        )}
      </div>
    </div>
  );
}

function label(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}

function ReviewRow({
  label,
  value,
  detail,
  action,
  onAction,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium">{value}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
        {children}
      </div>
      {action && onAction && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          aria-label={`${action} ${label.toLowerCase()}`}
        >
          {action}
        </Button>
      )}
    </div>
  );
}
