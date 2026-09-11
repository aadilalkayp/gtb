import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFindUniqueClient } from "@gtb/db/hooks";
import { formatINR, formatDate, humanize } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { submitPayment, type UploadedDocument } from "@/lib/api";
import { milestonePaces, milestoneDisplayStatus, planPace } from "@/lib/insights";
import { FileUploadField } from "@/components/FileUploadField";
import { EmptyState } from "@/components/EmptyState";
import { Button, Input, ProgressRing, StatusBadge } from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Wallet } from "lucide-react";

export function PortalPayments() {
  const { user } = useAuth();
  const clientId = user?.client?.id;

  const {
    data: client,
    isLoading,
    refetch,
  } = useFindUniqueClient(
    {
      where: { id: clientId ?? "" },
      include: {
        clientPlan: {
          include: {
            milestones: { orderBy: { milestoneNumber: "asc" } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    },
    { enabled: Boolean(clientId) },
  );

  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const plan = client?.clientPlan ?? null;
  const pace = useMemo(() => (plan ? planPace(plan) : null), [plan]);
  const paces = useMemo(() => (plan ? milestonePaces(plan) : []), [plan]);

  if (isLoading || !client) return <FullPageSpinner />;

  if (!plan || !pace) {
    return (
      <EmptyState
        icon={Wallet}
        title="No plan yet"
        hint="Your payments appear here after you choose a plan."
      />
    );
  }

  const payments = plan.payments;
  const total = plan.priceAtEnrollment;
  const underReview = payments
    .filter((p) => p.status === "pending_review")
    .reduce((t, p) => t + p.amount, 0);
  const submittable = Math.max(pace.balance - underReview, 0);
  const progress = total ? pace.paidTotal / total : 0;
  const suggested = Math.min(
    pace.behindAmount > 0 ? pace.behindAmount : (pace.nextDue?.remaining ?? submittable),
    submittable,
  );

  async function submit() {
    const value = Number(amount || suggested);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Enter a positive whole amount.");
      return;
    }
    if (value > submittable) {
      setError(`You can submit at most ${formatINR(submittable)} right now.`);
      return;
    }
    if (!doc) return;
    setSubmitting(true);
    setError(undefined);
    try {
      // STATE-6: payment submission + leadPhase advance are atomic server-side.
      await submitPayment(value, doc.id);
      setDoc(null);
      setAmount("");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-display">My payments</h1>

      {/* Summary */}
      <section className="card flex items-center gap-5 p-5">
        <ProgressRing value={progress} size={84} strokeWidth={8} className="text-primary">
          <span className="text-sm font-bold">{Math.round(progress * 100)}%</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Package</p>
            <p className="font-num mt-0.5 font-semibold">{formatINR(total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="font-num mt-0.5 font-semibold text-success">
              {formatINR(pace.paidTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="font-num mt-0.5 font-semibold">{formatINR(pace.balance)}</p>
          </div>
        </div>
      </section>

      {/* Expected schedule — pay any amount, any time; these are the checkpoints. */}
      {paces.length > 0 && pace.balance > 0 && (
        <section className="card divide-y divide-border">
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold">Payment schedule</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pay any amount at any time — these dates are when each part is expected.
            </p>
          </div>
          {paces.map((p, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {formatINR(p.milestone.amount)}
                  {p.status !== "paid" && p.remaining < p.milestone.amount && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {formatINR(p.remaining)} left
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expected by {formatDate(p.milestone.dueDate)}
                </p>
              </div>
              <StatusBadge status={milestoneDisplayStatus(p)} />
            </div>
          ))}
        </section>
      )}

      {/* Make a payment */}
      {submittable > 0 && client.status !== "lead" && (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Make a payment</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pay via UPI, bank transfer, or cash, then submit the amount with a screenshot or
              receipt. Your CRO will verify it.
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Amount (₹)</p>
            <Input
              type="number"
              min={1}
              max={submittable}
              value={amount}
              placeholder={String(suggested || submittable)}
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
            <Button disabled={!doc} loading={submitting} onClick={submit}>
              Submit payment
            </Button>
          </div>
        </section>
      )}
      {submittable > 0 && client.status === "lead" && (
        <Link
          to="/portal/onboarding"
          className="block rounded-lg border border-border bg-muted/40 p-4 text-center text-sm text-primary transition-colors duration-150 hover:border-border-strong hover:bg-muted active:scale-[0.99]"
        >
          Finish your onboarding to submit your first payment →
        </Link>
      )}
      {pace.balance === 0 && (
        <p className="card p-6 text-center text-sm text-muted-foreground">
          All settled — thank you! 🎉
        </p>
      )}

      {/* History */}
      {payments.length > 0 && (
        <section className="card divide-y divide-border">
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold">Your payments</h2>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {p.kind === "waiver" ? "Waived" : formatINR(p.amount)}
                    {p.kind === "waiver" && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {formatINR(p.amount)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.approvedAt ?? p.createdAt)}
                    {p.paymentMethod && ` · ${humanize(p.paymentMethod)}`}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              {p.status === "rejected" && p.rejectionReason && (
                <p className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
                  {p.rejectionReason}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
