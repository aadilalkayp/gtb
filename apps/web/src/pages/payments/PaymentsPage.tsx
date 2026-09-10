import { useMemo, useState } from "react";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { Link } from "react-router-dom";
import { Check, X, FileText, IndianRupee, Pencil } from "lucide-react";
import { useCountPayment, useFindManyPayment, useFindManyClientPlan } from "@gtb/db/hooks";

const PAGE_SIZE = 50;
import {
  formatINR,
  formatDate,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { approvePayment, rejectPayment, recordPayment, getDocumentUrl } from "@/lib/api";
import { planPace, type PlanPaymentLite } from "@/lib/insights";
import { QueryErrorState } from "@/components/QueryErrorState";
import { PageHeader } from "@/components/PageHeader";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";
import { MilestoneScheduleModal } from "./MilestoneScheduleModal";

type Tab = "review" | "collections" | "history";

interface PaymentRow {
  id: string;
  amount: number;
  kind: string;
  status: string;
  createdAt: string | Date;
  approvedAt: string | Date | null;
  rejectionReason: string | null;
  proofDocument: { id: string; fileName: string } | null;
  clientPlan: {
    planNameSnapshot: string;
    client: { id: string; name: string; clientCode: string; status: string };
  };
}

interface PlanRow extends PlanPaymentLite {
  id: string;
  planNameSnapshot: string;
  milestones: { amount: number; dueDate: string | Date }[];
  client: { id: string; name: string; clientCode: string; status: string };
}

type Action =
  | { kind: "approve"; row: PaymentRow }
  | { kind: "reject"; row: PaymentRow }
  | { kind: "record"; plan: PlanRow }
  | { kind: "schedule"; plan: PlanRow }
  | null;

const REVIEW_WHERE = { status: "pending_review" } as const;

export function PaymentsPage() {
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [tab, setTabState] = useState<Tab>("review");
  const [action, setAction] = useState<Action>(null);
  const [flash, setFlash] = useState<string>();
  const [page, setPage] = useState(0);

  function setTab(t: Tab) {
    setTabState(t);
    setPage(0); // a grown page size must not carry over to the next tab
  }

  // PERF-1: the tab filter is the server-side WHERE and the page size is a
  // real `take`.
  const paymentsQ = useFindManyPayment(
    {
      include: {
        proofDocument: { select: { id: true, fileName: true } },
        clientPlan: {
          select: {
            planNameSnapshot: true,
            client: { select: { id: true, name: true, clientCode: true, status: true } },
          },
        },
      },
      ...(tab === "review" ? { where: REVIEW_WHERE } : {}),
      orderBy: { createdAt: "desc" as const },
      take: (page + 1) * PAGE_SIZE,
    },
    { enabled: tab !== "collections" },
  );

  // Collections: every enrolled plan with its schedule + ledger; balance and
  // pace are derived client-side from the same shared math the alerts use.
  const plansQ = useFindManyClientPlan({
    include: {
      milestones: { orderBy: { milestoneNumber: "asc" as const } },
      payments: { select: { amount: true, status: true, kind: true } },
      client: { select: { id: true, name: true, clientCode: true, status: true } },
    },
  });

  const reviewCountQ = useCountPayment({ where: REVIEW_WHERE });

  const payments = (paymentsQ.data ?? []) as unknown as PaymentRow[];
  const plans = (plansQ.data ?? []) as unknown as PlanRow[];

  const collections = useMemo(() => {
    return plans
      .map((p) => ({ plan: p, pace: planPace(p) }))
      .filter(({ plan, pace }) => pace.balance > 0 && plan.client.status !== "cancelled")
      .sort(
        (a, b) => b.pace.behindAmount - a.pace.behindAmount || b.pace.balance - a.pace.balance,
      );
  }, [plans]);

  const behindCount = collections.filter((c) => c.pace.behindAmount > 0).length;

  const tabs: TabDef<Tab>[] = [
    { id: "review", label: "To review", count: reviewCountQ.data ?? 0 },
    { id: "collections", label: "Collections", count: behindCount },
    { id: "history", label: "History" },
  ];

  const isLoading = tab === "collections" ? plansQ.isLoading : paymentsQ.isLoading;
  const isError = tab === "collections" ? plansQ.isError : paymentsQ.isError;
  const error = tab === "collections" ? plansQ.error : paymentsQ.error;

  function refresh() {
    void paymentsQ.refetch();
    void plansQ.refetch();
    void reviewCountQ.refetch();
  }

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        subtitle="Review submissions, chase balances, and record money as it arrives."
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
            onRetry={refresh}
          />
        ) : tab === "collections" ? (
          collections.length === 0 ? (
            <div className="card p-12 text-center text-sm text-muted-foreground">
              Every enrolled client is fully paid. 🎉
            </div>
          ) : (
            <div className="card divide-y divide-border">
              {collections.map(({ plan, pace }) => (
                <div
                  key={plan.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/clients/${plan.client.id}`}
                        className="font-medium hover:underline"
                      >
                        {plan.client.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {plan.client.clientCode}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {plan.planNameSnapshot} · {formatINR(pace.paidTotal)} of{" "}
                      {formatINR(plan.priceAtEnrollment)} paid
                      {pace.nextDue && (
                        <>
                          {" "}
                          · next {formatINR(pace.nextDue.remaining)} by{" "}
                          {formatDate(pace.nextDue.dueDate)}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-num font-semibold">{formatINR(pace.balance)}</p>
                    {pace.behindAmount > 0 ? (
                      <p className="text-xs font-medium text-danger">
                        {formatINR(pace.behindAmount)} behind
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">on track</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAction({ kind: "schedule", plan })}
                        title="Edit payment schedule"
                      >
                        <Pencil className="h-4 w-4" /> Schedule
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAction({ kind: "record", plan })}
                    >
                      <IndianRupee className="h-4 w-4" /> Record
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : payments.length === 0 ? (
          <div className="card p-12 text-center text-sm text-muted-foreground">
            {tab === "review" ? "Nothing to review right now." : "No payments yet."}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {payments.map((r) => (
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
                    {r.clientPlan.planNameSnapshot}
                    {r.kind === "waiver" && " · Waiver"}
                    {" · "}
                    {r.status === "approved" && r.approvedAt
                      ? `Approved ${formatDate(r.approvedAt)}`
                      : `Submitted ${formatDate(r.createdAt)}`}
                  </p>
                  {r.status === "rejected" && r.rejectionReason && (
                    <p className="mt-0.5 text-xs text-danger">{r.rejectionReason}</p>
                  )}
                </div>

                <span className="font-num font-semibold">{formatINR(r.amount)}</span>
                <StatusBadge status={r.status} />

                <div className="flex items-center gap-1.5">
                  {r.proofDocument && <ProofButton documentId={r.proofDocument.id} />}
                  {r.status === "pending_review" && (
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
                </div>
              </div>
            ))}
          </div>
        )}
        {tab !== "collections" &&
          !isLoading &&
          !isError &&
          payments.length >= (page + 1) * PAGE_SIZE && (
            <LoadMoreButton onClick={() => setPage((p) => p + 1)} />
          )}
      </div>

      {action?.kind === "approve" && (
        <ApproveModal
          row={action.row}
          onClose={() => setAction(null)}
          onDone={(converted) => {
            setAction(null);
            refresh();
            setFlash(
              converted
                ? `${action.row.clientPlan.client.name} is now converted. Assign their team.`
                : "Payment approved.",
            );
          }}
        />
      )}
      {action?.kind === "reject" && (
        <RejectModal
          row={action.row}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            refresh();
            setFlash("Payment rejected. The client has been notified.");
          }}
        />
      )}
      {action?.kind === "record" && (
        <RecordModal
          plan={action.plan}
          canWaive={isAdmin}
          onClose={() => setAction(null)}
          onDone={(converted) => {
            setAction(null);
            refresh();
            setFlash(
              converted
                ? `${action.plan.client.name} is now converted. Assign their team.`
                : "Payment recorded.",
            );
          }}
        />
      )}
      {action?.kind === "schedule" && (
        <MilestoneScheduleModal
          clientId={action.plan.client.id}
          clientName={action.plan.client.name}
          priceAtEnrollment={action.plan.priceAtEnrollment}
          milestones={action.plan.milestones}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            refresh();
            setFlash("Payment schedule updated.");
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
  onClose,
  onDone,
}: {
  row: PaymentRow;
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
      title="Approve payment"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={submitting}>
            Approve · {formatINR(row.amount)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatINR(row.amount)} from{" "}
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
  row: PaymentRow;
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
      title="Reject payment"
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
          Let {row.clientPlan.client.name} know what to fix. They can submit a fresh payment.
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

export function RecordModal({
  plan,
  canWaive,
  onClose,
  onDone,
}: {
  plan: PlanRow;
  canWaive: boolean;
  onClose: () => void;
  onDone: (converted: boolean) => void;
}) {
  const pace = planPace(plan);
  const suggested = pace.behindAmount > 0 ? pace.behindAmount : (pace.nextDue?.remaining ?? pace.balance);
  const [amount, setAmount] = useState(String(suggested));
  const [kind, setKind] = useState<"payment" | "waiver">("payment");
  const [method, setMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Enter a positive whole amount.");
      return;
    }
    if (value > pace.balance) {
      setError(`That's more than the ${formatINR(pace.balance)} balance.`);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await recordPayment({
        clientId: plan.client.id,
        amount: value,
        kind,
        ...(kind === "payment" ? { paymentMethod: method } : {}),
        notes: notes.trim() || undefined,
      });
      onDone(res.converted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record payment");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === "waiver" ? "Waive an amount" : "Record payment"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={submitting}>
            {kind === "waiver" ? "Waive" : "Record"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{plan.client.name}</span> ·{" "}
          {formatINR(pace.balance)} outstanding
          {pace.behindAmount > 0 && (
            <span className="text-danger"> ({formatINR(pace.behindAmount)} behind)</span>
          )}
          .
        </p>
        {canWaive && (
          <Field label="Type">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as "payment" | "waiver")}
            >
              <option value="payment">Payment received</option>
              <option value="waiver">Waiver / discount</option>
            </Select>
          </Field>
        )}
        <Field label="Amount (₹)" required>
          <Input
            type="number"
            min={1}
            max={pace.balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {kind === "payment" && (
          <Field label="Payment method" required>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
