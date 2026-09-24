import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Check,
  Moon,
  Pencil,
  Plus,
  Scale,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  useCreateFitnessExercise,
  useCreateTrainerNote,
  useCreateWeightLog,
  useDeleteFitnessExercise,
  useDeleteTrainerNote,
  useFindManyBodyMeasurement,
  useFindManyTrainerNote,
  useFindManyWeightLog,
  useFindUniqueFitnessPlan,
  useUpdateFitnessCheckIn,
  useUpdateFitnessExercise,
  useUpdateFitnessPlan,
  useUpdateFitnessWorkoutDay,
} from "@gtb/db/hooks";
import {
  derivePlanHealth,
  formatDate,
  journeyPhases,
  planDayNumber,
  planWeekNumber,
  thisWeekProgress,
  todaysWorkout,
  workoutAdherence,
  workoutDayState,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { sendFitnessReminder } from "@/lib/api";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  ProgressRing,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { WeekStrip } from "@/components/fitness/WeekStrip";
import { WeightChart } from "@/components/fitness/WeightChart";
import { WorkoutChecklist, type ChecklistExercise } from "@/components/fitness/WorkoutChecklist";
import { cn } from "@/lib/utils";

type Tab = "overview" | "plan" | "progress" | "checkins" | "notes";

/**
 * Staff view of one client's fitness journey (sketch 2): overview with today's
 * workout and week strip, the full day-by-day plan (editable), progress,
 * check-ins with trainer replies, and trainer notes.
 */
export function FitnessClientPage() {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [reminderState, setReminderState] = useState<"idle" | "sending" | "sent" | "already">("idle");

  const {
    data: plan,
    isLoading,
    refetch,
  } = useFindUniqueFitnessPlan(
    {
      where: { id: id ?? "" },
      include: {
        days: { include: { exercises: true }, orderBy: { dayIndex: "asc" } },
        checkIns: { orderBy: { weekNumber: "desc" } },
        trainer: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, clientCode: true, city: true } },
      },
    },
    { enabled: Boolean(id) },
  );

  const updatePlan = useUpdateFitnessPlan();
  const updateDay = useUpdateFitnessWorkoutDay();
  const updateExercise = useUpdateFitnessExercise();

  const derived = useMemo(() => {
    if (!plan) return null;
    return {
      health: derivePlanHealth(plan, plan.days),
      adherence: workoutAdherence(plan.days),
      week: thisWeekProgress(plan.days),
      dayNo: planDayNumber(plan),
      weekNo: planWeekNumber(plan),
      today: todaysWorkout(plan.days),
    };
  }, [plan]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (!plan || !derived) {
    return <EmptyState icon={StickyNote} title="Plan not found" hint="It may have been removed." />;
  }

  const isAdmin = role === "founder" || role === "ops_head";
  const canEdit = isAdmin || plan.trainerId === user?.id || role === "fitness_trainer";

  const remind = async () => {
    setReminderState("sending");
    try {
      const res = await sendFitnessReminder(plan.id);
      setReminderState(res.sent ? "sent" : "already");
    } catch {
      setReminderState("idle");
    }
  };

  const tabs: TabDef<Tab>[] = [
    { id: "overview", label: "Overview" },
    { id: "plan", label: "Plan" },
    { id: "progress", label: "Progress" },
    { id: "checkins", label: "Check-ins" },
    { id: "notes", label: "Notes" },
  ];

  const missedToday =
    derived.today && !derived.today.isRestDay && !derived.today.completedAt;

  return (
    <div className="page">
      <Link
        to="/fitness"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Fitness Operations
      </Link>

      {/* Header */}
      <div className="card mt-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/clients/${plan.client.id}`} className="font-display text-xl font-semibold hover:underline">
                {plan.client.name}
              </Link>
              <span className="text-xs text-muted-foreground">{plan.client.clientCode}</span>
              <StatusBadge status={derived.health} />
              {plan.status !== "active" && <StatusBadge status={plan.status} />}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span>
                Day {derived.dayNo} / {plan.durationDays}
              </span>
              <span>{plan.client.city}</span>
              {plan.trainer && <span>Trainer: {plan.trainer.name}</span>}
            </p>
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Goal · </span>
              {plan.goal}
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-center">
              <ProgressRing
                value={(derived.adherence.pct ?? 0) / 100}
                size={64}
                className="text-primary"
              >
                <span className="font-num text-sm font-semibold">
                  {derived.adherence.pct ?? 0}%
                </span>
              </ProgressRing>
              <p className="mt-1 text-[11px] text-muted-foreground">Adherence</p>
            </div>
            <div className="text-center">
              <p className="font-num text-2xl font-semibold">
                {derived.week.done}
                <span className="text-base text-muted-foreground"> / {derived.week.scheduled}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">This week</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void remind()}
              disabled={reminderState === "sending" || reminderState === "sent"}
            >
              <Bell className="mr-1.5 h-4 w-4" />
              {reminderState === "sent"
                ? "Reminder sent"
                : reminderState === "already"
                  ? "Already reminded today"
                  : "Send Reminder"}
            </Button>
            {plan.status === "active" && derived.dayNo >= plan.durationDays && (
              <Button
                variant="outline"
                size="sm"
                loading={updatePlan.isPending}
                onClick={() =>
                  updatePlan.mutate(
                    { where: { id: plan.id }, data: { status: "completed" } },
                    { onSuccess: () => void refetch() },
                  )
                }
              >
                <Check className="mr-1.5 h-4 w-4" /> Mark plan completed
              </Button>
            )}
            {missedToday && (
              <Badge tone="warning" className="ml-auto">
                Today's workout still open
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "overview" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <JourneyBar dayNo={derived.dayNo} durationDays={plan.durationDays} />
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">This Week</h2>
              <span className="text-sm text-muted-foreground">
                {derived.week.done} / {derived.week.scheduled} completed
              </span>
            </div>
            <WeekStrip days={plan.days} className="mt-4 justify-between" />
          </div>
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold">
              Today's Workout
              {derived.today && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {derived.today.title}
                </span>
              )}
            </h2>
            <div className="mt-3">
              {derived.today ? (
                <WorkoutChecklist
                  day={derived.today as never}
                  canTick={canEdit}
                  busy={updateDay.isPending || updateExercise.isPending}
                  onToggleExercise={(ex: ChecklistExercise) =>
                    updateExercise.mutate({
                      where: { id: ex.id },
                      data: { completedAt: ex.completedAt ? null : new Date() },
                    })
                  }
                  onToggleDay={() =>
                    updateDay.mutate({
                      where: { id: derived.today!.id },
                      data: { completedAt: derived.today!.completedAt ? null : new Date() },
                    })
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">No workout scheduled today.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "plan" && <PlanTab plan={plan} canEdit={canEdit} onChanged={() => void refetch()} />}
      {tab === "progress" && (
        <ProgressTab clientId={plan.client.id} plan={plan} staffId={user?.id ?? ""} canEdit={canEdit} />
      )}
      {tab === "checkins" && (
        <CheckInsTab checkIns={plan.checkIns} canEdit={canEdit} onChanged={() => void refetch()} />
      )}
      {tab === "notes" && <NotesTab clientId={plan.client.id} authorId={user?.id ?? ""} canEdit={canEdit} />}
    </div>
  );
}

function JourneyBar({ dayNo, durationDays }: { dayNo: number; durationDays: number }) {
  const phases = journeyPhases(durationDays);
  const pct = Math.round((Math.max(0, dayNo) / durationDays) * 100);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{durationDays}-Day Journey</h2>
        <span className="font-num text-sm text-muted-foreground">
          Day {dayNo} / {durationDays} · {pct}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {phases.map((p) => {
          const reached = dayNo >= p.fromDay;
          return (
            <div key={p.key}>
              <p className={cn("text-[11px] font-medium", reached ? "text-primary" : "text-muted-foreground")}>
                {p.label}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {p.fromDay}–{p.toDay}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Plan tab ---------------------------------------------------------------

interface DayRow {
  id: string;
  dayIndex: number;
  date: Date | string;
  title: string;
  isRestDay: boolean;
  completedAt: Date | string | null;
  exercises: ChecklistExercise[];
}

function PlanTab({
  plan,
  canEdit,
  onChanged,
}: {
  plan: { days: DayRow[]; durationDays: number };
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editDay, setEditDay] = useState<DayRow | null>(null);
  const weeks = useMemo(() => {
    const map = new Map<number, DayRow[]>();
    for (const d of plan.days) {
      const w = Math.ceil(d.dayIndex / 7);
      map.set(w, [...(map.get(w) ?? []), d]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [plan.days]);

  return (
    <div className="mt-4 space-y-4">
      {weeks.map(([week, days]) => (
        <div key={week} className="card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Week {week}</h3>
          <div className="mt-2 divide-y divide-border">
            {days.map((d) => {
              const state = workoutDayState(d);
              return (
                <div key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="font-num w-14 shrink-0 text-xs text-muted-foreground">
                    Day {d.dayIndex}
                  </span>
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {formatDate(d.date)}
                  </span>
                  {d.isRestDay ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Moon className="h-3.5 w-3.5" /> {d.title}
                    </span>
                  ) : (
                    <span className="font-medium">{d.title}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {!d.isRestDay && `${d.exercises.length} exercises`}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge
                      status={state === "today" ? "pending" : state}
                      className="text-[11px]"
                    />
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditDay(d)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Edit day ${d.dayIndex}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {editDay && (
        <EditDayModal
          day={editDay}
          onClose={() => setEditDay(null)}
          onChanged={() => {
            setEditDay(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function EditDayModal({
  day,
  onClose,
  onChanged,
}: {
  day: DayRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const updateDay = useUpdateFitnessWorkoutDay();
  const createExercise = useCreateFitnessExercise();
  const updateExercise = useUpdateFitnessExercise();
  const deleteExercise = useDeleteFitnessExercise();

  const [title, setTitle] = useState(day.title);
  const [isRest, setIsRest] = useState(day.isRestDay);
  const [newName, setNewName] = useState("");
  const [newSets, setNewSets] = useState("3");
  const [newReps, setNewReps] = useState("12");
  const [error, setError] = useState<string>();

  const saveDay = async () => {
    setError(undefined);
    try {
      await updateDay.mutateAsync({
        where: { id: day.id },
        data: { title: title.trim() || day.title, isRestDay: isRest },
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the day");
    }
  };

  const addExercise = async () => {
    if (!newName.trim()) return;
    try {
      await createExercise.mutateAsync({
        data: {
          dayId: day.id,
          order: day.exercises.length,
          name: newName.trim(),
          sets: newSets ? Number(newSets) : undefined,
          reps: newReps ? Number(newReps) : undefined,
        },
      });
      setNewName("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the exercise");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Day ${day.dayIndex} · ${formatDate(day.date)}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => void saveDay()} loading={updateDay.isPending}>
            Save day
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-4">
          <Field label="Workout title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRest}
              onChange={(e) => setIsRest(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Rest day
          </label>
        </div>

        {!isRest && (
          <div>
            <p className="mb-2 text-sm font-medium">Exercises</p>
            <div className="space-y-1.5">
              {[...day.exercises]
                .sort((a, b) => a.order - b.order)
                .map((ex) => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    onSave={(data) =>
                      updateExercise.mutate({ where: { id: ex.id }, data }, { onSuccess: onChanged })
                    }
                    onDelete={() =>
                      deleteExercise.mutate({ where: { id: ex.id } }, { onSuccess: onChanged })
                    }
                  />
                ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <Field label="New exercise">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Incline Push-ups"
                  />
                </Field>
              </div>
              <Field label="Sets">
                <Input
                  type="number"
                  className="w-16"
                  value={newSets}
                  onChange={(e) => setNewSets(e.target.value)}
                />
              </Field>
              <Field label="Reps">
                <Input
                  type="number"
                  className="w-16"
                  value={newReps}
                  onChange={(e) => setNewReps(e.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                onClick={() => void addExercise()}
                loading={createExercise.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function ExerciseRow({
  exercise,
  onSave,
  onDelete,
}: {
  exercise: ChecklistExercise;
  onSave: (data: { sets?: number | null; reps?: number | null }) => void;
  onDelete: () => void;
}) {
  const [sets, setSets] = useState(exercise.sets?.toString() ?? "");
  const [reps, setReps] = useState(exercise.reps?.toString() ?? "");
  const dirty = sets !== (exercise.sets?.toString() ?? "") || reps !== (exercise.reps?.toString() ?? "");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
      <span className="flex-1 truncate font-medium">{exercise.name}</span>
      <Input
        type="number"
        className="h-7 w-14 text-xs"
        value={sets}
        onChange={(e) => setSets(e.target.value)}
        aria-label="Sets"
      />
      <span className="text-xs text-muted-foreground">×</span>
      <Input
        type="number"
        className="h-7 w-14 text-xs"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        aria-label="Reps"
      />
      {dirty && (
        <button
          type="button"
          onClick={() =>
            onSave({ sets: sets ? Number(sets) : null, reps: reps ? Number(reps) : null })
          }
          className="rounded-lg p-1 text-success transition-colors hover:bg-success/10"
          aria-label="Save exercise"
        >
          <Check className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
        aria-label="Remove exercise"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---- Progress tab -------------------------------------------------------------

function ProgressTab({
  clientId,
  plan,
  staffId,
  canEdit,
}: {
  clientId: string;
  plan: { startWeightKg: number | null; targetWeightKg: number | null };
  staffId: string;
  canEdit: boolean;
}) {
  const { data: logs, refetch } = useFindManyWeightLog({
    where: { clientId },
    orderBy: { date: "asc" },
  });
  const { data: measurements } = useFindManyBodyMeasurement({
    where: { clientId },
    orderBy: { date: "desc" },
    take: 8,
  });
  const createLog = useCreateWeightLog();
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string>();

  const points = logs ?? [];
  const current = points[points.length - 1]?.weightKg ?? plan.startWeightKg;
  const start = plan.startWeightKg ?? points[0]?.weightKg ?? null;
  const delta = current != null && start != null ? Math.round((current - start) * 10) / 10 : null;

  const log = async () => {
    const kg = Number(weight);
    if (!kg || kg < 20 || kg > 300) {
      setError("Enter a weight between 20 and 300 kg.");
      return;
    }
    setError(undefined);
    try {
      await createLog.mutateAsync({
        data: { clientId, recordedById: staffId, date: new Date(), weightKg: kg },
      });
      setWeight("");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log the weight");
    }
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Weight</h2>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                className="h-8 w-24 text-sm"
                placeholder="kg"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <Button size="sm" variant="secondary" onClick={() => void log()} loading={createLog.isPending}>
                <Scale className="mr-1 h-3.5 w-3.5" /> Log
              </Button>
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-4">
          {points.length > 1 ? (
            <WeightChart points={points} targetKg={plan.targetWeightKg} />
          ) : (
            <p className="text-sm text-muted-foreground">Not enough entries for a trend yet.</p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-border px-2 py-2">
            <p className="font-num text-sm font-semibold">{start != null ? `${start} kg` : "—"}</p>
            <p className="text-[11px] text-muted-foreground">Starting</p>
          </div>
          <div className="rounded-xl border border-border px-2 py-2">
            <p className="font-num text-sm font-semibold">
              {current != null ? `${current} kg` : "—"}
              {delta != null && delta !== 0 && (
                <span className={`ml-1 text-xs ${delta < 0 ? "text-success" : "text-warning"}`}>
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">Current</p>
          </div>
          <div className="rounded-xl border border-border px-2 py-2">
            <p className="font-num text-sm font-semibold">
              {plan.targetWeightKg != null ? `${plan.targetWeightKg} kg` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">Target</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">Body Measurements</h2>
        {!measurements?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing logged yet. The client can log measurements from their portal.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {measurements.map((m) => (
              <div key={m.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">{formatDate(m.date)}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-num">
                  {m.chestCm != null && <span>Chest {m.chestCm}</span>}
                  {m.waistCm != null && <span>Waist {m.waistCm}</span>}
                  {m.hipsCm != null && <span>Hips {m.hipsCm}</span>}
                  {m.bicepCm != null && <span>Bicep {m.bicepCm}</span>}
                  {m.thighCm != null && <span>Thigh {m.thighCm}</span>}
                </p>
                {m.note && <p className="mt-1 text-xs text-muted-foreground">{m.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Check-ins tab -----------------------------------------------------------

function CheckInsTab({
  checkIns,
  canEdit,
  onChanged,
}: {
  checkIns: {
    id: string;
    weekNumber: number;
    energyLevel: number | null;
    weightKg: number | null;
    note: string | null;
    trainerComment: string | null;
    createdAt: Date | string;
  }[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const update = useUpdateFitnessCheckIn();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (checkIns.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={StickyNote}
          title="No check-ins yet"
          hint="The client submits a short check-in from their portal each week."
        />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {checkIns.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">Week {c.weekNumber}</span>
            <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
            {c.energyLevel != null && (
              <Badge tone={c.energyLevel >= 4 ? "success" : c.energyLevel >= 3 ? "info" : "warning"}>
                Energy {c.energyLevel}/5
              </Badge>
            )}
            {c.weightKg != null && <Badge tone="neutral">{c.weightKg} kg</Badge>}
          </div>
          {c.note && <p className="mt-2 text-sm">{c.note}</p>}
          {c.trainerComment ? (
            <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Trainer reply · </span>
              {c.trainerComment}
            </p>
          ) : (
            canEdit && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Reply to the client">
                    <Textarea
                      rows={2}
                      value={drafts[c.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={update.isPending}
                  onClick={() => {
                    const text = (drafts[c.id] ?? "").trim();
                    if (!text) return;
                    update.mutate(
                      { where: { id: c.id }, data: { trainerComment: text } },
                      { onSuccess: onChanged },
                    );
                  }}
                >
                  Send
                </Button>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Notes tab -----------------------------------------------------------------

function NotesTab({
  clientId,
  authorId,
  canEdit,
}: {
  clientId: string;
  authorId: string;
  canEdit: boolean;
}) {
  const { data: notes, refetch } = useFindManyTrainerNote({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });
  const createNote = useCreateTrainerNote();
  const deleteNote = useDeleteTrainerNote();
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";

  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string>();

  const add = async () => {
    if (!content.trim()) return;
    setError(undefined);
    try {
      await createNote.mutateAsync({
        data: { clientId, authorId, content: content.trim(), visibleToClient: visible },
      });
      setContent("");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the note");
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {canEdit && (
        <div className="card p-4">
          <Field label="Add a note">
            <Textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Good consistency this week. Keep the same intensity and maintain water intake."
            />
          </Field>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Visible to the client
            </label>
            <Button size="sm" onClick={() => void add()} loading={createNote.isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Note
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      {!notes?.length ? (
        <EmptyState icon={StickyNote} title="No notes yet" hint="Notes keep the whole team in the loop." />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="card flex items-start gap-3 p-4">
              <div className="flex-1">
                <p className="text-sm">{n.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.author.name} · {formatDate(n.createdAt)}
                  {!n.visibleToClient && " · internal"}
                </p>
              </div>
              {(isAdmin || n.author.id === authorId) && (
                <button
                  type="button"
                  onClick={() =>
                    deleteNote.mutate({ where: { id: n.id } }, { onSuccess: () => void refetch() })
                  }
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
