import { useMemo, useState } from "react";
import { formatINR, formatDate } from "@gtb/shared";
import { submitPayment } from "@/lib/api";
import { milestonePaces, planPace, type PlanPaymentLite } from "@/lib/insights";
import { Button, Input } from "@/components/ui";
import { FileUploadField } from "@/components/FileUploadField";
import { cn } from "@/lib/utils";
import type { UploadedDocument } from "@/lib/api";

export function PaymentStep({
  client,
  clientPlan,
  onDone,
}: {
  client: { id: string; leadPhase: string };
  clientPlan: PlanPaymentLite & { planNameSnapshot: string };
  onDone: () => void | Promise<void>;
}) {
  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const pace = useMemo(() => planPace(clientPlan), [clientPlan]);
  const paces = useMemo(() => milestonePaces(clientPlan), [clientPlan]);
  const underReview = clientPlan.payments
    .filter((p) => p.status === "pending_review")
    .reduce((t, p) => t + p.amount, 0);
  const submittable = Math.max(pace.balance - underReview, 0);
  // The first milestone is the expected down payment — prefilled, and the
  // client may pay more (up to the balance) but the field is theirs to edit.
  const suggested = Math.min(pace.nextDue?.remaining ?? submittable, submittable);
  const [amount, setAmount] = useState(String(suggested));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Enter a positive whole amount.");
      return;
    }
    if (value > submittable) {
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

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{clientPlan.planNameSnapshot}</p>
        <p className="font-num text-2xl font-semibold">{formatINR(clientPlan.priceAtEnrollment)}</p>
        <p className="text-xs text-muted-foreground">Total package value</p>
      </div>

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

      {submittable > 0 ? (
        <div className="card space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">
              Pay your first {formatINR(Number(amount) || suggested)}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pay via UPI, bank transfer, or cash, then submit the amount with a screenshot or
              receipt. Your CRO will verify it to activate your program. You can pay the rest in
              parts, any amounts, as you go.
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Amount (₹)</p>
            <Input
              type="number"
              min={1}
              max={submittable}
              value={amount}
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
          <div className="flex justify-end">
            <Button size="lg" disabled={!doc} loading={submitting} onClick={submit}>
              Submit payment
            </Button>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center text-sm text-muted-foreground">
          Your payment has been submitted and is awaiting review.
        </div>
      )}
    </div>
  );
}
