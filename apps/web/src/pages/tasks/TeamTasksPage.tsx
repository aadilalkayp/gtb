import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, CalendarClock, User2, GripVertical } from "lucide-react";
import {
  useFindManyTask,
  useCreateTask,
  useUpdateTask,
  useFindManyUser,
  useFindManyClient,
} from "@gtb/db/hooks";
import {
  TASK_PRIORITIES,
  formatDate,
  daysUntil,
  humanize,
  type TaskPriority,
  type TaskStatus,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  type Tone,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  clientId: string | null;
  assignedTo: { id: string; name: string };
  client: { id: string; name: string } | null;
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "pending", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Done" },
];

const PRIORITY_META: Record<TaskPriority, { tone: Tone; bar: string }> = {
  urgent: { tone: "danger", bar: "bg-danger" },
  high: { tone: "warning", bar: "bg-warning" },
  medium: { tone: "info", bar: "bg-info" },
  low: { tone: "neutral", bar: "bg-border" },
};

export function TeamTasksPage() {
  const [showNew, setShowNew] = useState(false);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const draggingId = useRef<string | null>(null);

  const { data, isLoading, refetch } = useFindManyTask({
    include: {
      assignedTo: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });
  const updateTask = useUpdateTask();

  const tasks = (data ?? []) as unknown as TaskRow[];

  const byColumn = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = {
      pending: [],
      in_progress: [],
      completed: [],
      cancelled: [],
    };
    for (const t of tasks) (map[t.status as TaskStatus] ?? map.pending).push(t);
    return map;
  }, [tasks]);

  async function moveTo(taskId: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    await updateTask.mutateAsync({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "completed" ? new Date() : null,
      },
    });
    await refetch();
  }

  function onDrop(status: TaskStatus) {
    const id = draggingId.current;
    draggingId.current = null;
    setDragOver(null);
    if (id) void moveTo(id, status);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Team Tasks"
        subtitle="Assign work, track priorities, and keep everyone moving."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : !tasks.length ? (
        <div className="mt-6">
          <EmptyState
            icon={CalendarClock}
            title="No tasks yet"
            hint="Create a task and assign it to a teammate to get the board going."
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = byColumn[col.id];
            const active = dragOver === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== col.id) setDragOver(col.id);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the column entirely.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
                }}
                onDrop={() => onDrop(col.id)}
                className={cn(
                  "rounded-card border bg-muted/30 p-3 transition-colors",
                  active ? "border-primary/50 bg-primary/5" : "border-border",
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onDragStart={() => (draggingId.current = t.id)}
                      onMove={(s) => void moveTo(t.id, s)}
                    />
                  ))}
                  {!items.length && (
                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      Drop tasks here
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewTaskModal
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

function TaskCard({
  task: t,
  onDragStart,
  onMove,
}: {
  task: TaskRow;
  onDragStart: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  const meta = PRIORITY_META[t.priority as TaskPriority] ?? PRIORITY_META.medium;
  const due = t.dueDate ? daysUntil(t.dueDate) : null;
  const overdue = due != null && due < 0 && t.status !== "completed";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="card group cursor-grab overflow-hidden p-0 active:cursor-grabbing"
    >
      <div className="flex">
        <span className={cn("w-1 shrink-0", meta.bar)} />
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{t.title}</p>
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
          </div>
          {t.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={meta.tone}>{humanize(t.priority)}</Badge>
            {t.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                  overdue ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground",
                )}
              >
                <CalendarClock className="h-3 w-3" />
                {overdue ? "Overdue" : formatDate(t.dueDate)}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar name={t.assignedTo.name} size="sm" className="h-5 w-5 text-[10px]" />
              <span className="truncate">{t.assignedTo.name}</span>
            </span>
            {t.client && (
              <Link
                to={`/clients/${t.client.id}`}
                className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
              >
                <User2 className="h-3 w-3" />
                {t.client.name.split(" ")[0]}
              </Link>
            )}
          </div>

          {/* Quick move controls (keyboard / no-drag fallback) */}
          <div className="mt-2 flex gap-1">
            {COLUMNS.filter((c) => c.id !== t.status).map((c) => (
              <button
                key={c.id}
                onClick={() => onMove(c.id)}
                className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              >
                → {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const createTask = useCreateTask();
  const { data: staff } = useFindManyUser({
    where: { role: { not: "client" }, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const { data: clients } = useFindManyClient({
    where: { status: { in: ["lead", "converted", "active"] } },
    select: { id: true, name: true, clientCode: true },
    orderBy: { name: "asc" },
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string>();

  async function create() {
    if (!title.trim()) return setError("Give the task a title.");
    if (!assignedToId) return setError("Assign it to someone.");
    setError(undefined);
    try {
      await createTask.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          assignedToId,
          assignedById: user?.id ?? assignedToId,
          clientId: clientId || undefined,
          priority,
          dueDate: dueDate ? new Date(dueDate) : undefined,
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the task");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New task"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={createTask.isPending}>
            Create task
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
          />
        </Field>
        <Field label="Description">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any detail or context…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Assign to" required>
            <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">— Select —</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {humanize(s.role)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" required>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Related client">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— None —</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.clientCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
