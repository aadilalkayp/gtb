import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useFindManyPayment } from "@gtb/db/hooks";
import { formatINR, humanize, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@gtb/shared";
import { changePaymentStatus, editPayment } from "@/lib/api";
import { Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface EditablePayment {
  id: string;
  clientPlanId: string;
  amount: number;
  kind: string;
  status: string;
  paymentMethod: string | null;
  approvedAt: string | Date | null;
  notes: string | null;
}

type StatusTarget = "pending_review" | "rejected" | "voided";

/** yyyy-mm-dd of a timestamp in IST (the business timezone). */
function istDate(d: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

const STATUS_ACTIONS: Record<StatusTarget, { label: string; done: string }> = {
  pending_review: { label: "Move back to review", done: "Payment moved back to review." },
  rejected: { label: "Reject", done: "Payment rejected." },
  voided: { label: "Void", done: "Payment voided." },
};

function allowedTargets(p: EditablePayment): StatusTarget[] {
  if (p.kind === "waiver") return p.status === "voided" ? [] : ["voided"];
  if (p.status === "approved") return ["pending_review", "rejected", "voided"];
  if (p.status === "pending_review") return ["rejected", "voided"];
  if (p.status === "rejected") return ["pending_review", "voided"];
  return [];
}

/**
 * Staff correction of any payment record: fix its details, or move it to
 * another status (back to review, rejected, voided). Every change needs a
 * reason and is audit-logged server-side. Founder/ops can also switch a
 * record between payment and waiver; CROs can't touch waivers at all.
 */
export function EditPaymentModal({
  payment,
  clientName,
  clientStatus,
  canManageWaivers,
  onClose,
  onDone,
}: {
  payment: EditablePayment;
  clientName: string;
  clientStatus: string;
  canManageWaivers: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [kind, setKind] = useState(payment.kind);
  const [method, setMethod] = useState(payment.paymentMethod ?? "");
  const [paidAt, setPaidAt] = useState(istDate(payment.approvedAt));
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<StatusTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const voided = payment.status === "voided";
  const isApproved = payment.status === "approved";
  const targets = allowedTargets(payment);

  // Reversing the client's only approved payment leaves them converted (we
  // never roll a client's status back automatically), so say so up front.
  const approvedQ = useFindManyPayment(
    {
      where: { clientPlanId: payment.clientPlanId, status: "approved", kind: "payment" },
      select: { id: true },
    },
    { enabled: isApproved && payment.kind === "payment" },
  );
  const onlyApproved =
    isApproved &&
    payment.kind === "payment" &&
    clientStatus !== "lead" &&
    (approvedQ.data ?? []).length === 1;

  function needReason(): boolean {
    if (reason.trim()) return true;
    setError("Give a reason for the change.");
    return false;
  }

  async function save() {
    if (!needReason()) return;
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Amount must be a positive whole number.");
      return;
    }
    const patch: Parameters<typeof editPayment>[0] = { paymentId: payment.id, reason };
    if (value !== payment.amount) patch.amount = value;
    if (kind !== payment.kind) patch.kind = kind as "payment" | "waiver";
    if (kind === "payment" && method !== (payment.paymentMethod ?? "")) {
      patch.paymentMethod = method || null;
    }
    if (isApproved && paidAt && paidAt !== istDate(payment.approvedAt)) patch.paidAt = paidAt;
    if (notes.trim() !== (payment.notes ?? "")) patch.notes = notes.trim() || null;
    if (Object.keys(patch).length === 2) {
      setError("Nothing was changed.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await editPayment(patch);
      onDone("Payment updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the payment");
      setBusy(false);
    }
  }

  async function applyStatus(to: StatusTarget) {
    if (!needReason()) return;
    setBusy(true);
    setError(undefined);
    try {
      await changePaymentStatus(payment.id, to, reason);
      onDone(STATUS_ACTIONS[to].done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the payment");
      setBusy(false);
    }
  }

  function consequence(to: StatusTarget): string {
    const money = formatINR(payment.amount);
    const leaves = isApproved ? ` ${money} comes off ${clientName}'s paid total.` : "";
    if (to === "pending_review")
      return `It goes back to the review queue to be approved again.${leaves}`;
    if (to === "rejected") return `It stays on record as rejected, with your reason.${leaves}`;
    return `It stays on record, crossed out, and no longer counts anywhere.${leaves} Voiding can't be undone.`;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit payment"
      size="md"
      footer={
        voided ? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy && !confirming}>
              Save changes
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{clientName}</span> ·{" "}
            {payment.kind === "waiver" ? "Waiver" : "Payment"}
          </p>
          <StatusBadge status={payment.status} />
        </div>

        {voided ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            This payment was voided, so it can't be changed. It stays on record for audit.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount (₹)" required>
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              {canManageWaivers ? (
                <Field label="Type">
                  <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="payment">Payment received</option>
                    <option value="waiver">Waiver / discount</option>
                  </Select>
                </Field>
              ) : (
                <div />
              )}
              {kind === "payment" && (
                <Field label="Payment method" required={isApproved}>
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {!isApproved && <option value="">Not set</option>}
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {isApproved && (
                <Field label="Date received">
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </Field>
              )}
              <div className="col-span-2">
                <Field label="Notes">
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </div>

            <Field
              label="Reason for change"
              required
              hint="Saved in the activity log with the before and after."
            >
              <Input
                value={reason}
                placeholder="e.g. Client paid ₹12,000, not the full installment"
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>

            {onlyApproved && (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This is {clientName}'s only approved payment. Reversing it won't change their status
                ({humanize(clientStatus)}); update that from their profile if needed.
              </p>
            )}

            {targets.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Change status</p>
                {confirming ? (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <p className="text-sm">
                      <span className="font-medium">{STATUS_ACTIONS[confirming].label}?</span>{" "}
                      <span className="text-muted-foreground">{consequence(confirming)}</span>
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirming(null)}
                      >
                        Back
                      </Button>
                      <Button
                        size="sm"
                        variant={confirming === "voided" ? "danger" : "primary"}
                        loading={busy}
                        onClick={() => void applyStatus(confirming)}
                      >
                        Confirm {STATUS_ACTIONS[confirming].label.toLowerCase()}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {targets.map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        className={cn(t === "voided" && "text-danger")}
                        onClick={() => {
                          setError(undefined);
                          setConfirming(t);
                        }}
                      >
                        {STATUS_ACTIONS[t].label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
