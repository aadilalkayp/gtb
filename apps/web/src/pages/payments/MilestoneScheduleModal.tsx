import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatINR } from "@gtb/shared";
import { updateMilestones } from "@/lib/api";
import { Button, Input, Modal } from "@/components/ui";

interface EditRow {
  amount: string;
  dueDate: string; // yyyy-mm-dd
}

function toInputDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Founder/ops editor for a client's expected payment schedule (the
 * flexible-payments renegotiation path). Milestones are checkpoints, not
 * invoices — editing them never touches recorded money — but the schedule
 * must still sum exactly to the enrolled price (validated live here and
 * again server-side, where the change is audit-logged).
 */
export function MilestoneScheduleModal({
  clientId,
  clientName,
  priceAtEnrollment,
  milestones,
  onClose,
  onDone,
}: {
  clientId: string;
  clientName: string;
  priceAtEnrollment: number;
  milestones: { amount: number; dueDate: string | Date }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<EditRow[]>(
    milestones.length
      ? milestones.map((m) => ({ amount: String(m.amount), dueDate: toInputDate(m.dueDate) }))
      : [{ amount: String(priceAtEnrollment), dueDate: "" }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const total = useMemo(
    () => rows.reduce((t, r) => t + (Number(r.amount) || 0), 0),
    [rows],
  );
  const diff = priceAtEnrollment - total;

  function setRow(i: number, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
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
      setError(`The schedule must sum to ${formatINR(priceAtEnrollment)}.`);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await updateMilestones(
        clientId,
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
          <Button onClick={save} loading={submitting} disabled={diff !== 0}>
            Save schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Checkpoints for when money is expected — payments themselves stay flexible. The
          amounts must add up to the plan price of{" "}
          <span className="font-medium text-foreground">{formatINR(priceAtEnrollment)}</span>.
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
              <span className="text-danger">{formatINR(-diff)} over the plan price</span>
            )}
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
