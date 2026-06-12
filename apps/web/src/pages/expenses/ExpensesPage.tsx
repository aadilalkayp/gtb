import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Receipt, Wallet, Clock, CheckCircle2, Banknote, ExternalLink } from "lucide-react";
import {
  useFindManyExpense,
  useCreateExpense,
  useUpdateExpense,
  useFindManyExpenseCategory,
  useFindManyClient,
} from "@gtb/db/hooks";
import { formatINR, formatDate, humanize } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { getDocumentUrl } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { FileUploadField } from "@/components/FileUploadField";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PillFilter,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from "@/components/ui";

type Filter = "all" | "submitted" | "approved" | "rejected";

interface ExpenseRow {
  id: string;
  title: string;
  amount: number;
  date: Date | string;
  status: string;
  paidTo: string | null;
  notes: string | null;
  payeeId: string | null;
  receiptDocumentId: string | null;
  category: { id: string; name: string };
  submittedBy: { id: string; name: string };
  payee: { id: string; name: string } | null;
  client: { id: string; name: string; clientCode: string } | null;
}

function isThisMonth(d: Date | string): boolean {
  const date = new Date(d);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function ExpensesPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [filter, setFilter] = useState<Filter>("all");
  const [showNew, setShowNew] = useState(false);
  const [rejecting, setRejecting] = useState<ExpenseRow | null>(null);

  const { data, isLoading, refetch } = useFindManyExpense({
    include: {
      category: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, clientCode: true } },
    },
    orderBy: { date: "desc" },
  });

  const updateExpense = useUpdateExpense();
  const expenses = (data ?? []) as unknown as ExpenseRow[];

  const stats = useMemo(() => {
    const thisMonth = expenses.filter((e) => isThisMonth(e.date));
    const approvedMonth = thisMonth.filter((e) => e.status === "approved");
    const pending = expenses.filter((e) => e.status === "submitted");
    const payoutsMonth = approvedMonth.filter((e) => e.payeeId);
    const sum = (rows: ExpenseRow[]) => rows.reduce((t, e) => t + e.amount, 0);
    return {
      approvedMonth: sum(approvedMonth),
      pendingCount: pending.length,
      pendingSum: sum(pending),
      payoutsMonth: sum(payoutsMonth),
    };
  }, [expenses]);

  const visible = filter === "all" ? expenses : expenses.filter((e) => e.status === filter);

  async function approve(e: ExpenseRow) {
    await updateExpense.mutateAsync({
      where: { id: e.id },
      data: { status: "approved", approvedById: user?.id, approvedAt: new Date() },
    });
    await refetch();
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Expenses"
        subtitle="Submit, approve, and track spend and consultant payouts."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Submit expense
          </Button>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={CheckCircle2}
          accent="success"
          label="Approved this month"
          value={formatINR(stats.approvedMonth)}
        />
        <StatCard
          icon={Clock}
          accent="warning"
          label="Pending review"
          value={formatINR(stats.pendingSum)}
          footnote={`${stats.pendingCount} awaiting approval`}
          onClick={stats.pendingCount ? () => setFilter("submitted") : undefined}
        />
        <StatCard
          icon={Banknote}
          accent="info"
          label="Consultant payouts (month)"
          value={formatINR(stats.payoutsMonth)}
        />
      </div>

      <PillFilter
        className="mt-6"
        options={[
          { id: "all", label: "All" },
          { id: "submitted", label: "Pending" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : !visible.length ? (
          <EmptyState
            icon={Receipt}
            title="No expenses here"
            hint="Submit an expense or consultant payout to get started."
          />
        ) : (
          <div className="card divide-y divide-border">
            {visible.map((e) => (
              <ExpenseRowItem
                key={e.id}
                expense={e}
                canApprove={isAdmin && e.status === "submitted"}
                onApprove={() => void approve(e)}
                onReject={() => setRejecting(e)}
                busy={updateExpense.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <SubmitExpenseModal
          submittedById={user?.id ?? ""}
          onClose={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            void refetch();
          }}
        />
      )}
      {rejecting && (
        <RejectExpenseModal
          expense={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function ExpenseRowItem({
  expense: e,
  canApprove,
  onApprove,
  onReject,
  busy,
}: {
  expense: ExpenseRow;
  canApprove: boolean;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [openingReceipt, setOpeningReceipt] = useState(false);

  async function viewReceipt() {
    if (!e.receiptDocumentId) return;
    setOpeningReceipt(true);
    try {
      const url = await getDocumentUrl(e.receiptDocumentId);
      window.open(url, "_blank", "noopener");
    } finally {
      setOpeningReceipt(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {e.payeeId ? <Wallet className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{e.title}</span>
          <Badge tone="neutral">{e.category.name}</Badge>
          {e.client && (
            <Link
              to={`/clients/${e.client.id}`}
              className="text-xs text-muted-foreground hover:underline"
            >
              {e.client.name}
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(e.date)}
          {e.payee && ` · Payout to ${e.payee.name}`}
          {e.paidTo && ` · ${e.paidTo}`}
          {` · by ${e.submittedBy.name}`}
          {e.notes && ` — ${e.notes}`}
        </p>
      </div>

      <span className="text-sm font-semibold tabular-nums">{formatINR(e.amount)}</span>
      <StatusBadge status={e.status} />

      <div className="flex items-center gap-1.5">
        {e.receiptDocumentId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void viewReceipt()}
            loading={openingReceipt}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Receipt
          </Button>
        )}
        {canApprove && (
          <>
            <Button size="sm" onClick={onApprove} disabled={busy}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}>
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SubmitExpenseModal({
  submittedById,
  onClose,
  onDone,
}: {
  submittedById: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const createExpense = useCreateExpense();
  const { data: categories } = useFindManyExpenseCategory({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const { data: clients } = useFindManyClient({
    where: { status: { in: ["converted", "active"] } },
    select: { id: true, name: true, clientCode: true },
    orderBy: { name: "asc" },
  });

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidTo, setPaidTo] = useState("");
  const [clientId, setClientId] = useState("");
  const [receiptDocId, setReceiptDocId] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit() {
    const amt = Math.round(Number(amount));
    if (!categoryId) return setError("Pick a category.");
    if (!title.trim()) return setError("Add a short title.");
    if (!amt || amt <= 0) return setError("Enter a valid amount.");
    setError(undefined);
    try {
      await createExpense.mutateAsync({
        data: {
          categoryId,
          title: title.trim(),
          amount: amt,
          date: new Date(date),
          paidTo: paidTo.trim() || undefined,
          submittedById,
          clientId: clientId || undefined,
          receiptDocumentId: receiptDocId,
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the expense");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Submit expense"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createExpense.isPending}>
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" required>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Select —</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" required>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What was this for?"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid to">
            <Input
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              placeholder="Vendor / person"
            />
          </Field>
        </div>
        <Field
          label="Related client"
          hint="Optional — links the expense and enables a receipt upload."
        >
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— None —</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clientCode})
              </option>
            ))}
          </Select>
        </Field>
        {clientId && (
          <Field label="Receipt">
            <FileUploadField
              clientId={clientId}
              type="expense_receipt"
              label="Attach receipt"
              onUploaded={(doc) => setReceiptDocId(doc?.id)}
            />
          </Field>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function RejectExpenseModal({
  expense,
  onClose,
  onDone,
}: {
  expense: ExpenseRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const updateExpense = useUpdateExpense();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  async function confirm() {
    if (!reason.trim()) return setError("Add a reason so the submitter knows why.");
    setError(undefined);
    try {
      await updateExpense.mutateAsync({
        where: { id: expense.id },
        data: { status: "rejected", notes: reason.trim() },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject the expense");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject expense"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={updateExpense.isPending}>
            Reject
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {expense.title} · {formatINR(expense.amount)} · {humanize(expense.category.name)}
        </p>
        <Field label="Reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being rejected?"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
