import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckSquare, Clock, Dumbbell, Plus, TrendingUp, Users } from "lucide-react";
import {
  useCreateFitnessPlan,
  useFindManyClient,
  useFindManyFitnessPlan,
  useFindManyUser,
} from "@gtb/db/hooks";
import {
  FITNESS_TEMPLATES,
  buildPlanDays,
  derivePlanHealth,
  fitnessTemplate,
  formatDate,
  istStartOfDay,
  planDayNumber,
  thisWeekProgress,
  workoutAdherence,
  type FitnessHealth,
  type WorkoutDayLite,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Button,
  Field,
  Input,
  Modal,
  PillFilter,
  ProgressRing,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { WeekStrip } from "@/components/fitness/WeekStrip";

type Filter = "all" | "needs_follow_up" | "active" | "completed";

interface PlanRow {
  id: string;
  goal: string;
  startDate: Date | string;
  durationDays: number;
  status: string;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  days: WorkoutDayLite[];
  trainer: { name: string } | null;
  client: {
    id: string;
    name: string;
    clientCode: string;
    city: string;
    weightLogs: { date: Date | string; weightKg: number }[];
  };
}

/**
 * Fitness Operations (sketch 3): the roster of workout plans with derived
 * health chips, adherence, week strips, and aggregate stats.
 */
export function FitnessOperationsPage() {
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [filter, setFilter] = useState<Filter>("all");
  const [showNew, setShowNew] = useState(false);

  const {
    data: plans,
    isLoading,
    refetch,
  } = useFindManyFitnessPlan({
    where: { status: { in: ["active", "completed"] } },
    orderBy: { startDate: "desc" },
    include: {
      days: { select: { dayIndex: true, date: true, isRestDay: true, completedAt: true } },
      trainer: { select: { name: true } },
      client: {
        select: {
          id: true,
          name: true,
          clientCode: true,
          city: true,
          weightLogs: { select: { date: true, weightKg: true }, orderBy: { date: "asc" } },
        },
      },
    },
  });

  const rows = (plans ?? []) as unknown as PlanRow[];

  const withHealth = useMemo(
    () =>
      rows.map((p) => ({
        plan: p,
        health: derivePlanHealth(p as never, p.days),
        adherence: workoutAdherence(p.days),
        week: thisWeekProgress(p.days),
        dayNo: planDayNumber(p as never),
      })),
    [rows],
  );

  const counts = {
    needs_follow_up: withHealth.filter((r) => r.health === "needs_follow_up").length,
    active: withHealth.filter((r) => r.plan.status === "active").length,
    completed: withHealth.filter((r) => r.health === "completed").length,
  };
  const checkedInToday = withHealth.filter((r) =>
    r.plan.days.some(
      (d) =>
        d.completedAt &&
        istStartOfDay(new Date(d.date)).getTime() === istStartOfDay().getTime(),
    ),
  ).length;

  const filtered = withHealth.filter((r) => {
    if (filter === "all") return true;
    if (filter === "needs_follow_up") return r.health === "needs_follow_up";
    if (filter === "completed") return r.health === "completed";
    return r.plan.status === "active" && r.health !== "completed";
  });

  return (
    <div className="page">
      <PageHeader
        title="Fitness Operations"
        subtitle="Track workout plans, progress and client accountability."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        }
      />

      {/* Aggregate stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsStat icon={Users} label="Active Plans" value={counts.active} />
        <OpsStat icon={CheckSquare} label="Trained Today" value={checkedInToday} />
        <OpsStat icon={Clock} label="Need Follow-up" value={counts.needs_follow_up} tone="warning" />
        <OpsStat icon={TrendingUp} label="Completed" value={counts.completed} tone="success" />
      </div>

      <PillFilter
        className="mt-5"
        options={[
          { id: "all", label: "All" },
          { id: "needs_follow_up", label: `Need Attention (${counts.needs_follow_up})` },
          { id: "active", label: "Active" },
          { id: "completed", label: "Completed" },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No fitness plans"
            hint="Create a plan to start a client's day-by-day fitness journey."
            action={
              <Button onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4" /> New plan
              </Button>
            }
          />
        ) : (
          <div className="stagger-children grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map(({ plan, health, adherence, week, dayNo }) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                health={health}
                adherencePct={adherence.pct}
                week={week}
                dayNo={dayNo}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewPlanModal
          isAdmin={isAdmin}
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

function OpsStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "warning" | "success";
}) {
  const color =
    tone === "warning" ? "text-warning bg-warning/10" : tone === "success" ? "text-success bg-success/10" : "text-primary bg-primary/10";
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-num text-xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  health,
  adherencePct,
  week,
  dayNo,
}: {
  plan: PlanRow;
  health: FitnessHealth;
  adherencePct: number | null;
  week: { done: number; scheduled: number };
  dayNo: number;
}) {
  const logs = plan.client.weightLogs;
  const currentWeight = logs[logs.length - 1]?.weightKg ?? plan.startWeightKg;
  const startWeight = plan.startWeightKg ?? logs[0]?.weightKg ?? null;
  const delta =
    currentWeight != null && startWeight != null
      ? Math.round((currentWeight - startWeight) * 10) / 10
      : null;
  const lastDone = plan.days
    .filter((d) => d.completedAt)
    .map((d) => new Date(d.date).getTime())
    .sort((a, b) => b - a)[0];

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Link to={`/fitness/${plan.id}`} className="font-semibold hover:underline">
              {plan.client.name}
            </Link>
            <span className="text-xs text-muted-foreground">{plan.client.clientCode}</span>
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Day {dayNo} / {plan.durationDays}
            </span>
            <span>{plan.client.city}</span>
            {plan.trainer && <span>Trainer: {plan.trainer.name}</span>}
          </p>
        </div>
        <StatusBadge status={health} />
      </div>

      <p className="mt-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Goal · </span>
        {plan.goal}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-num text-sm font-semibold">
            {currentWeight != null ? `${currentWeight} kg` : "—"}
            {delta != null && delta !== 0 && (
              <span className={`ml-1 text-xs ${delta < 0 ? "text-success" : "text-warning"}`}>
                {delta > 0 ? "+" : ""}
                {delta} kg
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">Current weight</p>
        </div>
        <ProgressRing value={(adherencePct ?? 0) / 100} size={52} strokeWidth={5} className="text-primary">
          <span className="font-num text-[11px] font-semibold">{adherencePct ?? 0}%</span>
        </ProgressRing>
        <div className="text-right">
          <p className="font-num text-sm font-semibold">
            {week.done} / {week.scheduled}
          </p>
          <p className="text-[11px] text-muted-foreground">This week</p>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <WeekStrip days={plan.days} size="sm" className="justify-between" />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{lastDone ? `Last workout: ${formatDate(new Date(lastDone))}` : "No workouts yet"}</span>
        <Link
          to={`/fitness/${plan.id}`}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          View Details <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function NewPlanModal({
  isAdmin,
  onClose,
  onDone,
}: {
  isAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const createPlan = useCreateFitnessPlan();
  const { data: clients } = useFindManyClient({
    where: { status: { in: ["converted", "active"] } },
    select: { id: true, name: true, clientCode: true },
    orderBy: { name: "asc" },
  });
  const { data: trainers } = useFindManyUser(
    {
      where: { role: "fitness_trainer", isActive: true },
      orderBy: { name: "asc" },
    },
    { enabled: isAdmin },
  );
  const { user } = useAuth();

  const [clientId, setClientId] = useState("");
  const [trainerId, setTrainerId] = useState(isAdmin ? "" : (user?.id ?? ""));
  const defaultTemplate = FITNESS_TEMPLATES[0]!;
  const [templateKey, setTemplateKey] = useState(defaultTemplate.key);
  const [goal, setGoal] = useState(defaultTemplate.goalHint);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState("30");
  const [startWeight, setStartWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [dietNotes, setDietNotes] = useState("");
  const [error, setError] = useState<string>();

  const pickTemplate = (key: string) => {
    setTemplateKey(key);
    const t = fitnessTemplate(key);
    if (t && (goal === "" || FITNESS_TEMPLATES.some((x) => x.goalHint === goal))) {
      setGoal(t.goalHint);
    }
  };

  const create = async () => {
    if (!clientId) {
      setError("Pick a client.");
      return;
    }
    const duration = Number(durationDays);
    if (!duration || duration < 7 || duration > 120) {
      setError("Duration must be between 7 and 120 days.");
      return;
    }
    setError(undefined);
    const tpl = fitnessTemplate(templateKey);
    const days = buildPlanDays(templateKey, new Date(startDate), duration);
    try {
      await createPlan.mutateAsync({
        data: {
          clientId,
          trainerId: trainerId || undefined,
          title: tpl?.label ?? "Fitness Plan",
          goal: goal.trim() || (tpl?.goalHint ?? "General fitness"),
          templateKey,
          startDate: new Date(startDate),
          durationDays: duration,
          startWeightKg: startWeight ? Number(startWeight) : undefined,
          targetWeightKg: targetWeight ? Number(targetWeight) : undefined,
          dietNotes: dietNotes.trim() || undefined,
          days: {
            create: days.map((d) => ({
              dayIndex: d.dayIndex,
              date: d.date,
              title: d.title,
              isRestDay: d.isRestDay,
              exercises: {
                create: d.exercises.map((e, i) => ({
                  order: i,
                  name: e.name,
                  sets: e.sets,
                  reps: e.reps,
                  durationSec: e.durationSec,
                  equipment: e.equipment,
                })),
              },
            })),
          },
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the plan");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New fitness plan"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} loading={createPlan.isPending}>
            Create plan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client" required>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Select —</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.clientCode})
                </option>
              ))}
            </Select>
          </Field>
          {isAdmin ? (
            <Field label="Trainer">
              <Select value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {trainers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Trainer">
              <Input value={user?.name ?? ""} disabled />
            </Field>
          )}
        </div>

        <Field label="Program template">
          <Select value={templateKey} onChange={(e) => pickTemplate(e.target.value)}>
            {FITNESS_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Goal" required>
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Fat loss & better stamina"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Duration (days)" required>
            <Input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Starting weight (kg)">
            <Input
              type="number"
              step="0.1"
              value={startWeight}
              onChange={(e) => setStartWeight(e.target.value)}
            />
          </Field>
          <Field label="Target weight (kg)">
            <Input
              type="number"
              step="0.1"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Nutrition note (shown to the client)">
          <Textarea
            rows={2}
            value={dietNotes}
            onChange={(e) => setDietNotes(e.target.value)}
            placeholder="Meal guidance, hydration, what to avoid…"
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
