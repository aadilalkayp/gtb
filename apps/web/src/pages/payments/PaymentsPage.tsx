import { useState } from "react";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { Link } from "react-router-dom";
import { Check, X, FileText, IndianRupee } from "lucide-react";
import { useCountInstallment, useFindManyInstallment } from "@gtb/db/hooks";

const PAGE_SIZE = 50;
import {
  formatINR,
  formatDate,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@gtb/shared";
import { approvePayment, rejectPayment, getDocumentUrl } from "@/lib/api";
import { isInstallmentOverdue } from "@/lib/insights";
import { QueryErrorState } from "@/components/QueryErrorState";
import { PageHeader } from "@/components/PageHeader";
import {
  Button,
  Field,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";

type Tab = "review" | "pending" | "all";

interface Row {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: string | Date;
  status: string;
  proofDocument: { id: string; fileName: string } | null;
  clientPlan: {
    planNameSnapshot: string;
    client: { id: string; name: string; clientCode: string; status: string };
  };
}

type Action = { kind: "approve" | "record"; row: Row } | { kind: "reject"; row: Row } | null;

const REVIEW_WHERE = { status: "proof_submitted" } as const;
const PENDING_WHERE = {
  status: { in: ["pending", "overdue", "rejected"] as ("pending" | "overdue" | "rejected")[] },
};

export function PaymentsPage() {
  const [tab, setTabState] = useState<Tab>("review");
  const [action, setAction] = useState<Action>(null);
  const [flash, setFlash] = useState<string>();
  const [page, setPage] = useState(0);

  function setTab(t: Tab) {
    setTabState(t);
    setPage(0); // a grown page size must not carry over to the next tab
  }

  // PERF-1: the tab filter is the server-side WHERE and the page size is a real
  // `take` — the old version fetched the whole Installment table and filtered
  // in JS (and its "Load more" button changed nothing at all).
  const where = tab === "review" ? REVIEW_WHERE : tab === "pending" ? PENDING_WHERE : undefined;
  const { data, isLoading, isError, error, refetch } = useFindManyInstallment({
    include: {
      proofDocument: { select: { id: true, fileName: true } },
      clientPlan: {
        select: {
          planNameSnapshot: true,
          client: { select: { id: true, name: true, clientCode: true, status: true } },
        },
      },
    },
    ...(where ? { where } : {}),
    orderBy: { dueDate: "asc" },
    take: (page + 1) * PAGE_SIZE,
  });

  // Tab badges come from server counts, not from whichever page happens to be
  // loaded.
  const reviewCountQ = useCountInstallment({ where: REVIEW_WHERE });
  const pendingCountQ = useCountInstallment({ where: PENDING_WHERE });

  const rows = (data ?? []) as unknown as Row[];
  const visible = rows;

  const tabs: TabDef<Tab>[] = [
    { id: "review", label: "To review", count: reviewCountQ.data ?? 0 },
    { id: "pending", label: "Awaiting payment", count: pendingCountQ.data ?? 0 },
    { id: "all", label: "All" },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        subtitle="Review payment proofs, approve, and record payments."
      />

      {flash && (
        <div className="animate-fade-in mt-4 rounded-lg bg-success/10 px-4 py-2 text-sm text-success">
          {flash}
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mt-5" />

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : isError ? (
          <QueryErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : visible.length === 0 ? (
          <div className="card p-12 text-center text-sm text-muted-foreground">
            {tab === "review" ? "Nothing to review right now." : "No payments here."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {visible.map((r) => {
              // CALC-6: the shared overdue predicate — never marks waived or
              // approved installments as overdue.
              const overdue = isInstallmentOverdue(r);
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/clients/${r.clientPlan.client.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.clientPlan.client.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {r.clientPlan.client.clientCode}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.clientPlan.planNameSnapshot} · Installment {r.installmentNumber} · Due{" "}
                      {formatDate(r.dueDate)}
                      {overdue && <span className="ml-1 font-medium text-danger">(overdue)</span>}
                    </p>
                  </div>

                  <span className="font-num font-semibold">{formatINR(r.amount)}</span>
                  <StatusBadge status={r.status} />

                  <div className="flex items-center gap-1.5">
                    {r.proofDocument && <ProofButton documentId={r.proofDocument.id} />}
                    {r.status === "proof_submitted" && (
                      <>
                        <Button size="sm" onClick={() => setAction({ kind: "approve", row: r })}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAction({ kind: "reject", row: r })}
                        >
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </>
                    )}
                    {["pending", "overdue", "rejected"].includes(r.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAction({ kind: "record", row: r })}
                      >
                        <IndianRupee className="h-4 w-4" /> Record
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && !isError && rows.length >= (page + 1) * PAGE_SIZE && (
          <LoadMoreButton onClick={() => setPage((p) => p + 1)} />
        )}
      </div>

      {action && action.kind !== "reject" && (
        <ApproveModal
          row={action.row}
          isRecord={action.kind === "record"}
          onClose={() => setAction(null)}
          onDone={(converted) => {
            setAction(null);
            void refetch();
            void reviewCountQ.refetch();
            void pendingCountQ.refetch();
            setFlash(
              converted
                ? `${action.row.clientPlan.client.name} is now converted — assign their team.`
                : "Payment approved.",
            );
          }}
        />
      )}
      {action && action.kind === "reject" && (
        <RejectModal
          row={action.row}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void refetch();
            void reviewCountQ.refetch();
            void pendingCountQ.refetch();
            setFlash("Payment proof rejected — the client has been notified.");
          }}
        />
      )}
    </div>
  );
}

function ProofButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const url = await getDocumentUrl(documentId);
      window.open(url, "_blank", "noopener");
    } catch {
      /* surfaced rarely; keep the queue usable */
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={open} loading={loading}>
      {!loading && <FileText className="h-4 w-4" />} Proof
    </Button>
  );
}

function ApproveModal({
  row,
  isRecord,
  onClose,
  onDone,
}: {
  row: Row;
  isRecord: boolean;
  onClose: () => void;
  onDone: (converted: boolean) => void;
}) {
  const [method, setMethod] = useState<string>("upi");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await approvePayment(row.id, method, notes.trim() || undefined);
      onDone(res.converted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve payment");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isRecord ? "Record payment" : "Approve payment"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={submitting}>
            {isRecord ? "Record" : "Approve"} · {formatINR(row.amount)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Installment {row.installmentNumber} for{" "}
          <span className="font-medium text-foreground">{row.clientPlan.client.name}</span>.
        </p>
        <Field label="Payment method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function RejectModal({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    if (!reason.trim()) {
      setError("Please give a reason so the client can fix it.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await rejectPayment(row.id, reason.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject payment");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject payment proof"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={submitting}>
            Reject
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Let {row.clientPlan.client.name} know what to fix — they can re-upload their proof.
        </p>
        <Field label="Reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The screenshot doesn't show the amount or date."
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
