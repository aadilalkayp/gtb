import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, PhoneCall, AlertTriangle, Clock } from "lucide-react";
import {
  useFindManyFollowUp,
  useUpdateFollowUp,
  useCreateFollowUp,
  useFindManyClient,
} from "@gtb/db/hooks";
import {
  FOLLOWUP_TYPES,
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_DEFAULT_FREQUENCY_DAYS,
  formatDate,
  type FollowUpType,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { startOfDay, asDate } from "@/lib/insights";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";

type TabId = "today" | "overdue" | "upcoming" | "done";

interface FollowUpRow {
  id: string;
  type: string;
  dueDate: Date | string;
  status: string;
  notes: string | null;
  croId: string;
  client: { id: string; name: string; clientCode: string };
}

export function CroTrackingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("today");
  const [completing, setCompleting] = useState<FollowUpRow | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, refetch } = useFindManyFollowUp({
    include: { client: { select: { id: true, name: true, clientCode: true } } },
    orderBy: { dueDate: "asc" },
  });
  const updateFollowUp = useUpdateFollowUp();

  // Active clients for the no-contact alert + new follow-up picker.
  const { data: activeClients } = useFindManyClient({
    where: { status: "active" },
    select: { id: true, name: true, clientCode: true },
    orderBy: { name: "asc" },
  });

  const followUps = (data ?? []) as unknown as FollowUpRow[];
  const today = startOfDay();

  const groups = useMemo(() => {
    const pending = followUps.filter((f) => f.status !== "completed");
    return {
      today: pending.filter((f) => startOfDay(asDate(f.dueDate)).getTime() === today.getTime()),
      overdue: pending.filter((f) => startOfDay(asDate(f.dueDate)).getTime() < today.getTime()),
      upcoming: pending.filter((f) => startOfDay(asDate(f.dueDate)).getTime() > today.getTime()),
      done: followUps.filter((f) => f.status === "completed").reverse(),
    };
  }, [followUps, today]);

  // Clients not contacted in 7+ days: no follow-up completed in the last 7 days.
  const notContacted = useMemo(() => {
    if (!activeClients) return [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentByClient = new Set(
      followUps
        .filter((f) => f.status === "completed" && asDate(f.dueDate).getTime() >= sevenDaysAgo)
        .map((f) => f.client.id),
    );
    return activeClients.filter((c) => !recentByClient.has(c.id));
  }, [activeClients, followUps]);

  const tabs: TabDef<TabId>[] = [
    { id: "today", label: "Due today", count: groups.today.length },
    { id: "overdue", label: "Overdue", count: groups.overdue.length },
    { id: "upcoming", label: "Upcoming" },
    { id: "done", label: "Completed" },
  ];

  async function snooze(f: FollowUpRow) {
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    await updateFollowUp.mutateAsync({ where: { id: f.id }, data: { dueDate: tomorrow } });
    await refetch();
  }

  const visible = groups[tab];

  return (
    <div className="p-6">
      <PageHeader
        title="CRO Tracking"
        subtitle="Follow-ups, payment reminders, and client touch-points."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> New follow-up
          </Button>
        }
      />

      {/* No-contact alert */}
      {notContacted.length > 0 && (
        <div className="mt-5 rounded-card border border-warning/40 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(35_92%_32%)]">
            <AlertTriangle className="h-4 w-4" />
            {notContacted.length} active client{notContacted.length > 1 ? "s" : ""} not contacted in
            7+ days
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {notContacted.map((c) => (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="rounded-full bg-surface px-3 py-1 text-xs font-medium shadow-sm hover:shadow"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mt-5" />

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : !visible.length ? (
          <EmptyState
            icon={PhoneCall}
            title={tab === "today" ? "Nothing due today" : "No follow-ups here"}
            hint={
              tab === "overdue"
                ? "Great — you're on top of every client."
                : "Follow-ups are seeded when a client is activated, and you can add your own."
            }
          />
        ) : (
          <div className="card divide-y divide-border">
            {visible.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/clients/${f.client.id}`} className="font-medium hover:underline">
                      {f.client.name}
                    </Link>
                    <Badge tone="info">{FOLLOWUP_TYPE_LABELS[f.type as FollowUpType]}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Due {formatDate(f.dueDate)}
                    {f.notes && ` — ${f.notes}`}
                  </p>
                </div>
                {f.status !== "completed" && f.croId === user?.id && (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => setCompleting(f)}>
                      Complete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void snooze(f)}>
                      <Clock className="h-4 w-4" /> Snooze
                    </Button>
                  </div>
                )}
                {f.status === "completed" && <Badge tone="success">Done</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>

      {completing && (
        <CompleteFollowUpModal
          followUp={completing}
          onClose={() => setCompleting(null)}
          onDone={() => {
            setCompleting(null);
            void refetch();
          }}
        />
      )}
      {showNew && (
        <NewFollowUpModal
          clients={activeClients ?? []}
          croId={user?.id ?? ""}
          onClose={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function CompleteFollowUpModal({
  followUp,
  onClose,
  onDone,
}: {
  followUp: FollowUpRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const updateFollowUp = useUpdateFollowUp();
  const createFollowUp = useCreateFollowUp();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const type = followUp.type as FollowUpType;
  const cadence = FOLLOWUP_DEFAULT_FREQUENCY_DAYS[type];

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await updateFollowUp.mutateAsync({
        where: { id: followUp.id },
        data: {
          status: "completed",
          completedDate: new Date(),
          notes: notes.trim() || undefined,
        },
      });
      // Recurring types auto-create the next occurrence (SRS §12.3).
      if (cadence > 0) {
        await createFollowUp.mutateAsync({
          data: {
            clientId: followUp.client.id,
            croId: followUp.croId,
            type,
            dueDate: new Date(Date.now() + cadence * 24 * 60 * 60 * 1000),
          },
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the follow-up");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Complete ${FOLLOWUP_TYPE_LABELS[type].toLowerCase()}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy}>
            Mark done
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {followUp.client.name}
          {cadence > 0 && ` — the next one will be scheduled in ${cadence} days.`}
        </p>
        <Field label="Notes">
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go? Anything to flag?"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function NewFollowUpModal({
  clients,
  croId,
  onClose,
  onDone,
}: {
  clients: { id: string; name: string; clientCode: string }[];
  croId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const createFollowUp = useCreateFollowUp();
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<FollowUpType>("weekly_checkin");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string>();

  async function create() {
    if (!clientId) {
      setError("Pick a client.");
      return;
    }
    setError(undefined);
    try {
      await createFollowUp.mutateAsync({
        data: { clientId, croId, type, dueDate: new Date(dueDate) },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the follow-up");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New follow-up"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={createFollowUp.isPending}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client" required>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Select —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clientCode})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" required>
            <Select value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
              {FOLLOWUP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FOLLOWUP_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" required>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
