import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, List, CalendarCheck } from "lucide-react";
import { useFindManySession, useUpdateSession } from "@gtb/db/hooks";
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  formatDate,
  daysUntil,
  type ServiceType,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { completeSession, rescheduleSession } from "@/lib/api";
import { startOfDay, asDate } from "@/lib/insights";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { MonthCalendar, type CalendarEvent } from "@/components/MonthCalendar";
import { FileUploadField } from "@/components/FileUploadField";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PillFilter,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";

type ServiceFilter = "all" | ServiceType;
type WhenFilter = "upcoming" | "today" | "past" | "all";
type View = "list" | "calendar";
type ScopeFilter = "mine" | "all";

const SERVICE_CHIP: Record<ServiceType, string> = {
  skincare: "bg-info",
  fitness: "bg-success",
  styling: "bg-bride",
};

/** Document type a consultant uploads after completing a session of each service. */
const SERVICE_DOC_TYPE: Record<ServiceType, string> = {
  skincare: "skincare_plan",
  fitness: "fitness_plan",
  styling: "styling_guide",
};

interface SessionRow {
  id: string;
  serviceType: string;
  sessionNumber: number;
  scheduledDate: Date | string;
  actualDate: Date | string | null;
  status: string;
  notes: string | null;
  consultantId: string | null;
  consultant: { name: string } | null;
  client: { id: string; name: string; clientCode: string };
}

export function ConsultationsPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";

  const [service, setService] = useState<ServiceFilter>("all");
  const [when, setWhen] = useState<WhenFilter>("upcoming");
  const [view, setView] = useState<View>("list");
  // Consultants default to a focused queue of their own sessions; they can flip
  // to "all" to see the rest of their clients' schedule for context. Admins
  // (founder/ops) have no sessions of their own, so they always see all.
  const [scope, setScope] = useState<ScopeFilter>(isAdmin ? "all" : "mine");
  const [action, setAction] = useState<
    { kind: "complete"; session: SessionRow } | { kind: "reschedule"; session: SessionRow } | null
  >(null);

  const { data, isLoading, refetch } = useFindManySession({
    include: {
      consultant: { select: { name: true } },
      client: { select: { id: true, name: true, clientCode: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const sessions = (data ?? []) as unknown as SessionRow[];
  const today = startOfDay();

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (scope === "mine" && s.consultantId !== user?.id) return false;
      if (service !== "all" && s.serviceType !== service) return false;
      const d = startOfDay(asDate(s.scheduledDate));
      const open = s.status === "scheduled" || s.status === "delayed";
      switch (when) {
        case "today":
          return d.getTime() === today.getTime() && open;
        case "upcoming":
          return d.getTime() >= today.getTime() && open;
        case "past":
          return d.getTime() < today.getTime() || !open;
        case "all":
          return true;
      }
    });
  }, [sessions, service, when, today, scope, user?.id]);

  const canAct = (s: SessionRow) => isAdmin || s.consultantId === user?.id;

  const serviceTabs: TabDef<ServiceFilter>[] = [
    { id: "all", label: "All services" },
    ...SERVICE_TYPES.map((s) => ({ id: s as ServiceFilter, label: SERVICE_TYPE_LABELS[s] })),
  ];

  const calendarEvents: CalendarEvent[] = sessions
    .filter((s) => s.status === "scheduled" || s.status === "delayed")
    .filter((s) => scope === "all" || s.consultantId === user?.id)
    .filter((s) => service === "all" || s.serviceType === service)
    .map((s) => ({
      id: s.id,
      date: s.scheduledDate,
      label: `${s.client.name.split(" ")[0]} · ${SERVICE_TYPE_LABELS[s.serviceType as ServiceType]}`,
      color: SERVICE_CHIP[s.serviceType as ServiceType],
      onClick: canAct(s) ? () => setAction({ kind: "complete", session: s }) : undefined,
    }));

  const updateSession = useUpdateSession();

  async function setStatus(s: SessionRow, status: "cancelled" | "missed") {
    await updateSession.mutateAsync({ where: { id: s.id }, data: { status } });
    await refetch();
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Consultations"
        subtitle="Track, complete, and reschedule sessions across all services."
        actions={
          <>
            {!isAdmin && (
              <div className="flex rounded-md border border-border p-0.5 text-sm">
                {(
                  [
                    { id: "mine", label: "My sessions" },
                    { id: "all", label: "All sessions" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setScope(o.id)}
                    className={
                      "h-8 rounded px-3 font-medium transition-colors " +
                      (scope === o.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted")
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex rounded-md border border-border p-0.5">
              {(
                [
                  { id: "list", icon: List },
                  { id: "calendar", icon: CalendarDays },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={
                    "flex h-8 w-9 items-center justify-center rounded " +
                    (view === v.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted")
                  }
                  aria-label={v.id}
                >
                  <v.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </>
        }
      />

      <Tabs tabs={serviceTabs} active={service} onChange={setService} className="mt-5" />

      {view === "list" && (
        <PillFilter
          className="mt-4"
          options={[
            { id: "upcoming", label: "Upcoming" },
            { id: "today", label: "Today" },
            { id: "past", label: "Past" },
            { id: "all", label: "All" },
          ]}
          active={when}
          onChange={setWhen}
        />
      )}

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : view === "calendar" ? (
          <MonthCalendar events={calendarEvents} />
        ) : !filtered.length ? (
          <EmptyState
            icon={CalendarCheck}
            title="No sessions here"
            hint="Sessions appear when clients are activated and schedules are generated."
          />
        ) : (
          <div className="card divide-y divide-border">
            {filtered.map((s) => {
              const svc = s.serviceType as ServiceType;
              const open = s.status === "scheduled" || s.status === "delayed";
              const overdue = open && daysUntil(s.scheduledDate) < 0;
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SERVICE_CHIP[svc]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/clients/${s.client.id}`} className="font-medium hover:underline">
                        {s.client.name}
                      </Link>
                      <Badge tone="info">
                        {SERVICE_TYPE_LABELS[svc]} #{s.sessionNumber}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(s.actualDate ?? s.scheduledDate)}
                      {overdue && <span className="ml-1 font-medium text-danger">(past due)</span>}
                      {s.consultant && ` · ${s.consultant.name}`}
                      {s.notes && ` — ${s.notes}`}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                  {open && canAct(s) && (
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => setAction({ kind: "complete", session: s })}>
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAction({ kind: "reschedule", session: s })}
                      >
                        Reschedule
                      </Button>
                      {overdue && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void setStatus(s, "missed")}
                        >
                          Missed
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void setStatus(s, "cancelled")}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {action?.kind === "complete" && (
        <CompleteSessionModal
          session={action.session}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void refetch();
          }}
        />
      )}
      {action?.kind === "reschedule" && (
        <RescheduleModal
          session={action.session}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function CompleteSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: SessionRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const svc = session.serviceType as ServiceType;
  const [notes, setNotes] = useState("");
  const [actualDate, setActualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await completeSession(session.id, { notes: notes.trim() || undefined, actualDate });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the session");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Complete ${SERVICE_TYPE_LABELS[svc]} session ${session.sessionNumber}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy}>
            Mark completed
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {session.client.name} · scheduled {formatDate(session.scheduledDate)}
        </p>
        <Field label="Actual date" required>
          <Input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
        </Field>
        <Field label="Session notes">
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was covered, observations, next steps…"
          />
        </Field>
        <Field
          label={`Upload ${SERVICE_TYPE_LABELS[svc].toLowerCase()} ${svc === "styling" ? "guide" : "plan"} (optional)`}
        >
          <FileUploadField
            clientId={session.client.id}
            type={SERVICE_DOC_TYPE[svc]}
            sessionId={session.id}
            label="Attach document"
            onUploaded={() => undefined}
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function RescheduleModal({
  session,
  onClose,
  onDone,
}: {
  session: SessionRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    if (!newDate) {
      setError("Pick a new date.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await rescheduleSession(session.id, newDate);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reschedule");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reschedule session"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy}>
            Reschedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {session.client.name} · currently {formatDate(session.scheduledDate)}. The client will be
          notified of the new date.
        </p>
        <Field label="New date" required>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
