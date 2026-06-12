import { useMemo, useState } from "react";
import { useFindUniqueClient, useUpdateInstallment, useUpdateClient } from "@gtb/db/hooks";
import { formatINR, formatDate, LEAD_PHASE_ORDER, type LeadPhase } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { installmentDisplayStatus } from "@/lib/insights";
import type { UploadedDocument } from "@/lib/api";
import { FileUploadField } from "@/components/FileUploadField";
import { EmptyState } from "@/components/EmptyState";
import { Button, ProgressRing, StatusBadge } from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Wallet } from "lucide-react";

const PAYABLE = new Set(["pending", "overdue", "rejected"]);

export function PortalPayments() {
  const { user } = useAuth();
  const clientId = user?.client?.id;
  const updateInstallment = useUpdateInstallment();
  const updateClient = useUpdateClient();

  const {
    data: client,
    isLoading,
    refetch,
  } = useFindUniqueClient(
    {
      where: { id: clientId ?? "" },
      include: {
        clientPlan: { include: { installments: { orderBy: { installmentNumber: "asc" } } } },
      },
    },
    { enabled: Boolean(clientId) },
  );

  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const installments = useMemo(
    () => client?.clientPlan?.installments ?? [],
    [client?.clientPlan?.installments],
  );
  const payable = installments.find((i) => PAYABLE.has(i.status));

  if (isLoading || !client) return <FullPageSpinner />;

  if (!client.clientPlan) {
    return (
      <EmptyState
        icon={Wallet}
        title="No plan yet"
        hint="Your payment schedule appears here after you choose a plan."
      />
    );
  }

  const total = client.clientPlan.priceAtEnrollment;
  const paid = installments
    .filter((i) => i.status === "approved")
    .reduce((sum, i) => sum + i.amount, 0);
  const outstanding = Math.max(total - paid, 0);
  const progress = total ? paid / total : 0;

  async function submitProof() {
    if (!payable || !doc) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await updateInstallment.mutateAsync({
        where: { id: payable.id },
        data: { status: "proof_submitted", proofDocumentId: doc.id },
      });
      if (
        client &&
        client.status === "lead" &&
        LEAD_PHASE_ORDER[client.leadPhase as LeadPhase] < LEAD_PHASE_ORDER.payment_submitted
      ) {
        await updateClient.mutateAsync({
          where: { id: client.id },
          data: { leadPhase: "payment_submitted" },
        });
      }
      setDoc(null);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit proof");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">My payments</h1>

      {/* Summary */}
      <section className="card flex items-center gap-5 p-5">
        <ProgressRing value={progress} size={84} strokeWidth={8} className="text-primary">
          <span className="text-sm font-bold">{Math.round(progress * 100)}%</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Package</p>
            <p className="mt-0.5 font-semibold">{formatINR(total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="mt-0.5 font-semibold text-success">{formatINR(paid)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-0.5 font-semibold">{formatINR(outstanding)}</p>
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section className="card divide-y divide-border">
        {installments.map((i) => {
          const display = installmentDisplayStatus(i);
          const isNext = payable?.id === i.id;
          return (
            <div key={i.id} className={`px-4 py-3 ${isNext ? "bg-primary/5" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Installment {i.installmentNumber} of {installments.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Due {formatDate(i.dueDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatINR(i.amount)}</span>
                  <StatusBadge status={display} />
                </div>
              </div>
              {i.status === "rejected" && i.rejectionReason && (
                <p className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
                  {i.rejectionReason}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* Upload proof for the next payable installment */}
      {payable && client.status !== "lead" && (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">
              Pay installment {payable.installmentNumber} — {formatINR(payable.amount)}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pay via UPI, bank transfer, or cash, then upload a screenshot or receipt.
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
            <Button disabled={!doc} loading={submitting} onClick={submitProof}>
              Submit proof
            </Button>
          </div>
        </section>
      )}
      {payable && client.status === "lead" && (
        <p className="text-center text-sm text-muted-foreground">
          Finish your onboarding to submit your first payment.
        </p>
      )}
    </div>
  );
}
