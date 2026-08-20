import { useMemo, useState } from "react";
import { formatINR, formatDate } from "@gtb/shared";
import { submitPaymentProof } from "@/lib/api";
import { Button, StatusBadge } from "@/components/ui";
import { FileUploadField } from "@/components/FileUploadField";
import { cn } from "@/lib/utils";
import type { UploadedDocument } from "@/lib/api";

interface Installment {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: string | Date;
  status: string;
}

const PAYABLE = new Set(["pending", "overdue", "rejected"]);

export function PaymentStep({
  client,
  clientPlan,
  onDone,
}: {
  client: { id: string; leadPhase: string };
  clientPlan: { planNameSnapshot: string; priceAtEnrollment: number; installments: Installment[] };
  onDone: () => void | Promise<void>;
}) {
  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const installments = useMemo(
    () => [...clientPlan.installments].sort((a, b) => a.installmentNumber - b.installmentNumber),
    [clientPlan.installments],
  );
  const payable = installments.find((i) => PAYABLE.has(i.status));

  async function submit() {
    if (!payable || !doc) return;
    setSubmitting(true);
    setError(undefined);
    try {
      // STATE-6: proof submission + leadPhase advance are atomic server-side.
      await submitPaymentProof(payable.id, doc.id);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your payment proof");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{clientPlan.planNameSnapshot}</p>
        <p className="text-2xl font-semibold">{formatINR(clientPlan.priceAtEnrollment)}</p>
        <p className="text-xs text-muted-foreground">Total package value</p>
      </div>

      <div className="card divide-y divide-border">
        {installments.map((i) => {
          const isActive = payable?.id === i.id;
          return (
            <div
              key={i.id}
              className={cn(
                "flex items-center justify-between px-4 py-3",
                isActive && "bg-primary/5",
              )}
            >
              <div>
                <p className="text-sm font-medium">
                  Installment {i.installmentNumber}
                  {installments.length > 1 && ` of ${installments.length}`}
                </p>
                <p className="text-xs text-muted-foreground">Due {formatDate(i.dueDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{formatINR(i.amount)}</span>
                <StatusBadge status={i.status} />
              </div>
            </div>
          );
        })}
      </div>

      {payable ? (
        <div className="card space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">
              Pay installment {payable.installmentNumber} — {formatINR(payable.amount)}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pay via UPI, bank transfer, or cash, then upload a screenshot or receipt. Your CRO
              will verify it to activate your program.
            </p>
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
              Submit payment proof
            </Button>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center text-sm text-muted-foreground">
          Your payment proof has been submitted and is awaiting review.
        </div>
      )}
    </div>
  );
}
