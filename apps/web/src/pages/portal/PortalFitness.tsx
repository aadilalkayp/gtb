import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Camera,
  Dumbbell,
  Flame,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import {
  useCreateBodyMeasurement,
  useCreateFitnessCheckIn,
  useCreateWeightLog,
  useFindManyBodyMeasurement,
  useFindManyDocument,
  useFindManyFitnessPlan,
  useFindManyTrainerNote,
  useFindManyWeightLog,
  useUpdateFitnessExercise,
  useUpdateFitnessWorkoutDay,
} from "@gtb/db/hooks";
import {
  currentStreak,
  formatDate,
  planDayNumber,
  planWeekNumber,
  thisWeekProgress,
  todaysWorkout,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { getDocumentUrl, uploadClientDocument } from "@/lib/api";
import { Button, Field, Input, Modal, Spinner, Tabs, Textarea, type TabDef } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { WeekStrip } from "@/components/fitness/WeekStrip";
import { WeightChart } from "@/components/fitness/WeightChart";
import { WorkoutChecklist, type ChecklistExercise } from "@/components/fitness/WorkoutChecklist";

/**
 * Client fitness journey (sketch 1): Day X of N hero, today's workout
 * checklist, week strip, weight/measurement/photo progress, nutrition note,
 * weekly check-in, and trainer notes.
 */
export function PortalFitness() {
  const { user } = useAuth();
  const clientId = user?.client?.id;
  const userId = user?.id;

  const { data: plans, isLoading } = useFindManyFitnessPlan(
    {
      where: { clientId: clientId ?? "", status: "active" },
      orderBy: { startDate: "desc" },
      take: 1,
      include: {
        days: { include: { exercises: true }, orderBy: { dayIndex: "asc" } },
        checkIns: { orderBy: { weekNumber: "desc" } },
      },
    },
    { enabled: Boolean(clientId) },
  );
  const plan = plans?.[0];

  const { data: weightLogs } = useFindManyWeightLog(
    { where: { clientId: clientId ?? "" }, orderBy: { date: "asc" } },
    { enabled: Boolean(clientId) },
  );
  const { data: notes } = useFindManyTrainerNote(
    {
      where: { clientId: clientId ?? "", visibleToClient: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { author: { select: { name: true } } },
    },
    { enabled: Boolean(clientId) },
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!plan) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No fitness plan yet"
        hint="Your trainer will set up your day-by-day program after your first fitness session."
      />
    );
  }

  return (
    <FitnessJourney
      plan={plan as unknown as PortalPlan}
      weightLogs={weightLogs ?? []}
      notes={notes ?? []}
      clientId={clientId!}
      userId={userId!}
    />
  );
}

interface PortalDay {
  id: string;
  dayIndex: number;
  date: Date | string;
  title: string;
  isRestDay: boolean;
  completedAt: Date | string | null;
  exercises: ChecklistExercise[];
}

interface PortalCheckIn {
  id: string;
  weekNumber: number;
  energyLevel: number | null;
  weightKg: number | null;
  note: string | null;
  trainerComment: string | null;
}

interface PortalPlan {
  id: string;
  goal: string;
  startDate: Date | string;
  durationDays: number;
  status: string;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  dietNotes: string | null;
  days: PortalDay[];
  checkIns: PortalCheckIn[];
}

function FitnessJourney({
  plan,
  weightLogs,
  notes,
  clientId,
  userId,
}: {
  plan: PortalPlan;
  weightLogs: { id: string; date: Date | string; weightKg: number }[];
  notes: { id: string; content: string; createdAt: Date | string; author: { name: string } }[];
  clientId: string;
  userId: string;
}) {
  const [progressTab, setProgressTab] = useState<"weight" | "measurements" | "photos">("weight");
  const [logWeightOpen, setLogWeightOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const updateDay = useUpdateFitnessWorkoutDay();
  const updateExercise = useUpdateFitnessExercise();

  const dayNo = planDayNumber(plan);
  const weekNo = planWeekNumber(plan);
  const week = thisWeekProgress(plan.days);
  const streak = currentStreak(plan.days);
  const today = todaysWorkout(plan.days);

  const startWeight = plan.startWeightKg ?? weightLogs[0]?.weightKg ?? null;
  const currentWeight = weightLogs[weightLogs.length - 1]?.weightKg ?? startWeight;
  const weightDelta =
    startWeight != null && currentWeight != null ? currentWeight - startWeight : null;

  const thisWeeksCheckIn = plan.checkIns.find((c) => c.weekNumber === weekNo);

  const progressTabs: TabDef<"weight" | "measurements" | "photos">[] = [
    { id: "weight", label: "Weight" },
    { id: "measurements", label: "Measurements" },
    { id: "photos", label: "Photos" },
  ];

  const toggleExercise = (ex: ChecklistExercise) => {
    updateExercise.mutate({
      where: { id: ex.id },
      data: { completedAt: ex.completedAt ? null : new Date() },
    });
  };
  const toggleDay = () => {
    if (!today) return;
    updateDay.mutate({
      where: { id: today.id },
      data: { completedAt: today.completedAt ? null : new Date() },
    });
  };

  return (
    <div className="animate-fade-up space-y-5">
      {/* Journey hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
          Your fitness journey
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold">
          Day {Math.max(1, dayNo)} of {plan.durationDays}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          Stay consistent. A better you is closer than you think.
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${Math.round((Math.max(0, dayNo) / plan.durationDays) * 100)}%` }}
          />
        </div>
        <Dumbbell className="absolute -right-4 -top-4 h-28 w-28 rotate-12 text-white/10" />
      </section>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Target} label="Your Goal" value={plan.goal} />
        <StatCard
          icon={Calendar}
          label="This Week"
          value={`${week.done} / ${week.scheduled}`}
          sub="Workouts completed"
        />
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={`${streak} day${streak === 1 ? "" : "s"}`}
          sub={streak > 0 ? "Keep it going!" : "Start one today"}
        />
        <StatCard
          icon={Scale}
          label="Current Weight"
          value={currentWeight != null ? `${currentWeight} kg` : "—"}
          sub={
            weightDelta != null && weightDelta !== 0 ? (
              <span className={weightDelta < 0 ? "text-success" : "text-warning"}>
                {weightDelta < 0 ? (
                  <TrendingDown className="mr-0.5 inline h-3 w-3" />
                ) : (
                  <TrendingUp className="mr-0.5 inline h-3 w-3" />
                )}
                {Math.abs(Math.round(weightDelta * 10) / 10)} kg
              </span>
            ) : undefined
          }
        />
      </section>

      {/* Today's workout + week */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold">Today's Workout</h2>
              {today && <p className="mt-0.5 text-sm font-medium">{today.title}</p>}
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(new Date())}</span>
          </div>
          <div className="mt-4">
            {today ? (
              <WorkoutChecklist
                day={today}
                canTick
                busy={updateDay.isPending || updateExercise.isPending}
                onToggleExercise={toggleExercise}
                onToggleDay={toggleDay}
              />
            ) : (
              <p className="rounded-xl bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
                {dayNo === 0
                  ? `Your journey starts ${formatDate(plan.startDate)}.`
                  : "No workout scheduled for today."}
              </p>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">This Week</h2>
              <span className="text-sm text-muted-foreground">
                <span className="font-num font-medium text-foreground">{week.done}</span> /{" "}
                {week.scheduled} completed
              </span>
            </div>
            <WeekStrip days={plan.days} className="mt-4 justify-between" />
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Your Progress</h2>
              <Button variant="secondary" size="sm" onClick={() => setLogWeightOpen(true)}>
                <Scale className="mr-1.5 h-4 w-4" /> Log weight
              </Button>
            </div>
            <div className="mt-3">
              <Tabs tabs={progressTabs} active={progressTab} onChange={setProgressTab} />
            </div>
            <div className="mt-4">
              {progressTab === "weight" && (
                <>
                  {weightLogs.length > 1 ? (
                    <WeightChart points={weightLogs} targetKg={plan.targetWeightKg} height={176} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Log your weight each week to see the trend here.
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Starting" value={startWeight != null ? `${startWeight} kg` : "—"} />
                    <MiniStat
                      label="Current"
                      value={currentWeight != null ? `${currentWeight} kg` : "—"}
                    />
                    <MiniStat
                      label="Target"
                      value={plan.targetWeightKg != null ? `${plan.targetWeightKg} kg` : "—"}
                    />
                  </div>
                </>
              )}
              {progressTab === "measurements" && <MeasurementsPanel clientId={clientId} userId={userId} />}
              {progressTab === "photos" && <PhotosPanel clientId={clientId} />}
            </div>
          </section>
        </div>
      </div>

      {/* Nutrition + check-in */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card flex items-start gap-3 p-5">
          <UtensilsCrossed className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-semibold">Nutrition Note</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.dietNotes || "Follow the meal plan shared by your trainer for better results."}
            </p>
          </div>
          <Link
            to="/portal/documents"
            className="inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-medium shadow-xs transition-colors hover:border-border-strong hover:bg-muted/50"
          >
            View Diet Plan
          </Link>
        </section>

        <section className="card flex items-start gap-3 p-5">
          <Calendar className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-semibold">Weekly Check-in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {thisWeeksCheckIn
                ? `Week ${weekNo} submitted. ${thisWeeksCheckIn.trainerComment ? "Your trainer replied below." : "Your trainer will review it soon."}`
                : `Week ${weekNo} check-in: a minute on how the week felt.`}
            </p>
            {thisWeeksCheckIn?.trainerComment && (
              <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                {thisWeeksCheckIn.trainerComment}
              </p>
            )}
          </div>
          {!thisWeeksCheckIn && (
            <Button size="sm" onClick={() => setCheckInOpen(true)}>
              Submit Now
            </Button>
          )}
        </section>
      </div>

      {/* Trainer notes */}
      {notes.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-lg font-semibold">Trainer Notes</h2>
          <div className="mt-3 space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-sm">{n.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.author.name} · {formatDate(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <LogWeightModal
        open={logWeightOpen}
        onClose={() => setLogWeightOpen(false)}
        clientId={clientId}
        userId={userId}
      />
      <CheckInModal
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        planId={plan.id}
        weekNumber={weekNo}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border px-2 py-2">
      <p className="font-num text-sm font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function LogWeightModal({
  open,
  onClose,
  clientId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  userId: string;
}) {
  const createLog = useCreateWeightLog();
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string>();

  const save = async () => {
    const kg = Number(weight);
    if (!kg || kg < 20 || kg > 300) {
      setError("Enter a weight between 20 and 300 kg.");
      return;
    }
    setError(undefined);
    try {
      await createLog.mutateAsync({
        data: { clientId, recordedById: userId, date: new Date(), weightKg: kg },
      });
      setWeight("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the weight");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log today's weight"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={createLog.isPending}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Weight (kg)" required>
        <Input
          type="number"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 78.4"
        />
      </Field>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Modal>
  );
}

function CheckInModal({
  open,
  onClose,
  planId,
  weekNumber,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  weekNumber: number;
}) {
  const createCheckIn = useCreateFitnessCheckIn();
  const [energy, setEnergy] = useState(3);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    try {
      await createCheckIn.mutateAsync({
        data: {
          planId,
          weekNumber,
          energyLevel: energy,
          weightKg: weight ? Number(weight) : undefined,
          note: note.trim() || undefined,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the check-in");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Week ${weekNumber} check-in`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={createCheckIn.isPending}>
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="How was your energy this week?">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEnergy(n)}
                className={`h-10 w-10 rounded-xl border text-sm font-semibold transition-colors ${
                  energy === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border-strong"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Weight this week (kg, optional)">
          <Input
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Anything your trainer should know?">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Wins, struggles, travel days…"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function MeasurementsPanel({ clientId, userId }: { clientId: string; userId: string }) {
  const { data: measurements, refetch } = useFindManyBodyMeasurement({
    where: { clientId },
    orderBy: { date: "desc" },
    take: 6,
  });
  const create = useCreateBodyMeasurement();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({ chestCm: "", waistCm: "", hipsCm: "", bicepCm: "", thighCm: "" });
  const [error, setError] = useState<string>();

  const fields: { key: keyof typeof vals; label: string }[] = [
    { key: "chestCm", label: "Chest (cm)" },
    { key: "waistCm", label: "Waist (cm)" },
    { key: "hipsCm", label: "Hips (cm)" },
    { key: "bicepCm", label: "Bicep (cm)" },
    { key: "thighCm", label: "Thigh (cm)" },
  ];

  const save = async () => {
    const data = Object.fromEntries(
      Object.entries(vals)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [k, Number(v)]),
    );
    if (Object.keys(data).length === 0) {
      setError("Fill in at least one measurement.");
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync({
        data: { clientId, recordedById: userId, date: new Date(), ...data },
      });
      setOpen(false);
      setVals({ chestCm: "", waistCm: "", hipsCm: "", bicepCm: "", thighCm: "" });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save measurements");
    }
  };

  return (
    <div>
      {!measurements?.length ? (
        <p className="text-sm text-muted-foreground">No measurements logged yet.</p>
      ) : (
        <div className="space-y-2">
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
            </div>
          ))}
        </div>
      )}
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        Log measurements
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log measurements"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={create.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                type="number"
                step="0.5"
                value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}

function PhotosPanel({ clientId }: { clientId: string }) {
  const { data: photos, refetch } = useFindManyDocument({
    where: { clientId, type: "progress_photo" },
    orderBy: { createdAt: "desc" },
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      await uploadClientDocument({ clientId, type: "progress_photo", file });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const view = async (id: string) => {
    try {
      window.open(await getDocumentUrl(id), "_blank", "noopener");
    } catch {
      setError("Could not open the photo. Try again.");
    }
  };

  return (
    <div>
      {!photos?.length ? (
        <p className="text-sm text-muted-foreground">
          Add a progress photo every couple of weeks — same pose, same light.
        </p>
      ) : (
        <div className="space-y-1.5">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void view(p.id)}
              className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <span className="truncate">{p.fileName}</span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                {formatDate(p.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}
      <label className="mt-3 inline-flex">
        <input
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          disabled={uploading}
          onChange={(e) => void upload(e.target.files?.[0] ?? null)}
        />
        <span className="inline-flex cursor-pointer items-center rounded-xl bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80">
          <Camera className="mr-1.5 h-4 w-4" />
          {uploading ? "Uploading…" : "Add photo"}
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
