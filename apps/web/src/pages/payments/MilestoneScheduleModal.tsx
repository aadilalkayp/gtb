import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatINR } from "@gtb/shared";
import { updateMilestones } from "@/lib/api";
import { Button, Field, Input, Modal } from "@/components/ui";

interface EditRow {
  amount: string;
  dueDate: string; // yyyy-mm-dd
}

function toInputDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Founder/ops/CRO editor for a client's negotiated price and expected payment
 * schedule. Plans carry no price, so this is where each personal deal is
 * recorded. Milestones are checkpoints, not invoices (editing them never
 * touches recorded money), but they must sum exactly to the agreed price
 * (validated live here and again server-side, where the change is
 * audit-logged).
 */
export function MilestoneScheduleModal({
  clientId,
  clientName,
  agreedPrice,
  paidTotal,
  milestones,
  onClose,
  onDone,
}: {
  clientId: string;
  clientName: string;
  agreedPrice: number | null;
  /** Already settled (payments + waivers); the price can't go below it. */
  paidTotal: number;
  milestones: { amount: number; dueDate: string | Date }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [price, setPrice] = useState(agreedPrice != null ? String(agreedPrice) : "");
  const [rows, setRows] = useState<EditRow[]>(
    milestones.length
      ? milestones.map((m) => ({ amount: String(m.amount), dueDate: toInputDate(m.dueDate) }))
      : [{ amount: agreedPrice != null ? String(agreedPrice) : "", dueDate: "" }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const priceValue = Number(price) || 0;
  const total = useMemo(
    () => rows.reduce((t, r) => t + (Number(r.amount) || 0), 0),
    [rows],
  );
  const diff = priceValue - total;

  function changePrice(next: string) {
    // While there's a single milestone, keep it in step with the price, which
    // covers the common "one amount, one date" deal with no extra typing.
    setRows((rs) => (rs.length === 1 && rs[0] ? [{ ...rs[0], amount: next }] : rs));
    setPrice(next);
  }

  function setRow(i: number, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!Number.isInteger(priceValue) || priceValue <= 0) {
      setError("Enter the agreed price as a positive whole amount.");
      return;
    }
    if (priceValue < paidTotal) {
      setError(`The agreed price can't be below the ${formatINR(paidTotal)} already paid.`);
      return;
    }
    for (const r of rows) {
      const amount = Number(r.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        setError("Every milestone needs a positive whole amount.");
        return;
      }
      if (!r.dueDate) {
        setError("Every milestone needs a date.");
        return;
      }
    }
    if (diff !== 0) {
      setError(`The schedule must sum to ${formatINR(priceValue)}.`);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await updateMilestones(
        clientId,
        priceValue,
        rows.map((r) => ({ amount: Number(r.amount), dueDate: r.dueDate })),
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the schedule");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${clientName}'s payment schedule`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={submitting} disabled={priceValue <= 0 || diff !== 0}>
            Save schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Agreed price (₹)"
          required
          hint={
            paidTotal > 0
              ? `The fee negotiated with this client. ${formatINR(paidTotal)} has been paid so far.`
              : "The fee negotiated with this client."
          }
        >
          <Input
            type="number"
            min={Math.max(paidTotal, 1)}
            value={price}
            placeholder="e.g. 85000"
            onChange={(e) => changePrice(e.target.value)}
          />
        </Field>

        <p className="text-sm text-muted-foreground">
          Below are checkpoints for when money is expected. Payments themselves stay flexible,
          but the amounts must add up to the agreed price.
        </p>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                {i === 0 && (
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Amount (₹)</p>
                )}
                <Input
                  type="number"
                  min={1}
                  value={r.amount}
                  onChange={(e) => setRow(i, { amount: e.target.value })}
                />
              </div>
              <div className="flex-1">
                {i === 0 && (
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Expected by</p>
                )}
                <Input
                  type="date"
                  value={r.dueDate}
                  onChange={(e) => setRow(i, { dueDate: e.target.value })}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-0.5"
                disabled={rows.length === 1}
                onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                title="Remove milestone"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRows((rs) => [...rs, { amount: diff > 0 ? String(diff) : "", dueDate: "" }])
            }
          >
            <Plus className="h-4 w-4" /> Add milestone
          </Button>
          <p className="text-sm">
            {diff === 0 ? (
              <span className="text-success">Adds up ✓</span>
            ) : diff > 0 ? (
              <span className="text-warning">{formatINR(diff)} left to allocate</span>
            ) : (
              <span className="text-danger">{formatINR(-diff)} over the agreed price</span>
            )}
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
