/**
 * Fitness module logic (client sketches, Sep 2026): plan templates, workout-day
 * derivations (adherence, streaks, week strips), and the derived per-plan
 * health status shown on Fitness Operations.
 *
 * Everything here is DERIVED from FitnessPlan/FitnessWorkoutDay rows — like
 * payment pace, health status is never stored. All day math is IST.
 */
import { istAddDays, istDateParts, istStartOfDay } from "./format.js";

// ---- Enums -----------------------------------------------------------------

export const FITNESS_PLAN_STATUSES = ["active", "completed", "cancelled"] as const;
export type FitnessPlanStatus = (typeof FITNESS_PLAN_STATUSES)[number];

export const FITNESS_PLAN_STATUS_LABELS: Record<FitnessPlanStatus, string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Derived roster status — never stored (like milestone pace). */
export const FITNESS_HEALTH_STATUSES = [
  "on_track",
  "in_progress",
  "needs_follow_up",
  "completed",
] as const;
export type FitnessHealth = (typeof FITNESS_HEALTH_STATUSES)[number];

export const FITNESS_HEALTH_LABELS: Record<FitnessHealth, string> = {
  on_track: "On Track",
  in_progress: "In Progress",
  needs_follow_up: "Needs Follow-up",
  completed: "Completed",
};

// ---- Day-level derivations -------------------------------------------------

export interface WorkoutDayLite {
  dayIndex: number;
  date: Date | string;
  isRestDay: boolean;
  completedAt: Date | string | null;
}

export type WorkoutDayState = "completed" | "missed" | "rest" | "today" | "upcoming";

function dayStart(d: Date | string): number {
  return istStartOfDay(typeof d === "string" ? new Date(d) : d).getTime();
}

/** State of one workout day relative to `now` (IST calendar days). */
export function workoutDayState(day: WorkoutDayLite, now: Date = new Date()): WorkoutDayState {
  if (day.completedAt) return "completed";
  if (day.isRestDay) return "rest";
  const today = istStartOfDay(now).getTime();
  const d = dayStart(day.date);
  if (d < today) return "missed";
  if (d === today) return "today";
  return "upcoming";
}

/** The plan day scheduled for today, if any. */
export function todaysWorkout<T extends WorkoutDayLite>(days: T[], now: Date = new Date()): T | undefined {
  const today = istStartOfDay(now).getTime();
  return days.find((d) => dayStart(d.date) === today);
}

export interface Adherence {
  /** Non-rest days due so far (strictly past, plus today when completed). */
  due: number;
  done: number;
  /** 0–100, or null before anything is due. */
  pct: number | null;
}

/**
 * Workout adherence: completed / due-by-now, over non-rest days. Today's
 * workout only enters the denominator once it's done — an unfinished today is
 * "still open", not a miss.
 */
export function workoutAdherence(days: WorkoutDayLite[], now: Date = new Date()): Adherence {
  const today = istStartOfDay(now).getTime();
  let due = 0;
  let done = 0;
  for (const d of days) {
    if (d.isRestDay) continue;
    const t = dayStart(d.date);
    if (t < today || (t === today && d.completedAt)) {
      due += 1;
      if (d.completedAt) done += 1;
    }
  }
  return { due, done, pct: due === 0 ? null : Math.round((done / due) * 100) };
}

/**
 * Current streak: consecutive completed workout days counting back from today
 * (or yesterday when today is still open). Rest days neither break nor extend
 * the streak.
 */
export function currentStreak(days: WorkoutDayLite[], now: Date = new Date()): number {
  const today = istStartOfDay(now).getTime();
  const sorted = [...days].sort((a, b) => b.dayIndex - a.dayIndex);
  let streak = 0;
  let started = false;
  for (const d of sorted) {
    const t = dayStart(d.date);
    if (t > today) continue;
    if (d.isRestDay) continue;
    if (t === today && !d.completedAt) continue; // today still open — start from yesterday
    started = true;
    if (d.completedAt) streak += 1;
    else break;
  }
  return started ? streak : 0;
}

/** Monday-first weekday index (0=Mon … 6=Sun) of a date's IST calendar day. */
export function istWeekdayIndex(d: Date | string): number {
  const { y, m, day } = istDateParts(typeof d === "string" ? new Date(d) : d);
  return (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
}

export interface WeekStripEntry {
  /** IST start-of-day instant of this weekday. */
  date: Date;
  weekdayLabel: string;
  /** null when the plan has no day scheduled on this date. */
  state: WorkoutDayState | null;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mon–Sun strip for the IST week containing `now`. */
export function weekStrip(days: WorkoutDayLite[], now: Date = new Date()): WeekStripEntry[] {
  const monday = istAddDays(istStartOfDay(now), -istWeekdayIndex(now));
  const byDate = new Map(days.map((d) => [dayStart(d.date), d]));
  return WEEKDAY_LABELS.map((weekdayLabel, i) => {
    const date = istAddDays(monday, i);
    const day = byDate.get(date.getTime());
    return { date, weekdayLabel, state: day ? workoutDayState(day, now) : null };
  });
}

/** Completed vs scheduled non-rest workouts in the current IST week. */
export function thisWeekProgress(
  days: WorkoutDayLite[],
  now: Date = new Date(),
): { done: number; scheduled: number } {
  const monday = istAddDays(istStartOfDay(now), -istWeekdayIndex(now)).getTime();
  const nextMonday = monday + 7 * 24 * 60 * 60 * 1000;
  let done = 0;
  let scheduled = 0;
  for (const d of days) {
    const t = dayStart(d.date);
    if (t < monday || t >= nextMonday || d.isRestDay) continue;
    scheduled += 1;
    if (d.completedAt) done += 1;
  }
  return { done, scheduled };
}

// ---- Plan-level derivations ------------------------------------------------

export interface FitnessPlanLite {
  startDate: Date | string;
  durationDays: number;
  status: FitnessPlanStatus | string;
}

/** 1-based journey day. 0 before the start; clamped to durationDays after the end. */
export function planDayNumber(plan: FitnessPlanLite, now: Date = new Date()): number {
  const start = dayStart(plan.startDate);
  const today = istStartOfDay(now).getTime();
  const diff = Math.floor((today - start) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(0, Math.min(plan.durationDays, diff));
}

export interface JourneyPhase {
  key: string;
  label: string;
  fromDay: number;
  toDay: number;
}

/** Journey phases, scaled to the plan duration (the sketch's 1–3 / 4–10 / 11–20 / 21–30 for 30 days). */
export function journeyPhases(durationDays: number): JourneyPhase[] {
  const at = (f: number) => Math.max(1, Math.round(durationDays * f));
  const b1 = at(0.1);
  const b2 = at(1 / 3);
  const b3 = at(2 / 3);
  return [
    { key: "setup", label: "Setup", fromDay: 1, toDay: b1 },
    { key: "foundation", label: "Foundation", fromDay: b1 + 1, toDay: b2 },
    { key: "consistency", label: "Consistency", fromDay: b2 + 1, toDay: b3 },
    { key: "transformation", label: "Transformation", fromDay: b3 + 1, toDay: durationDays },
  ];
}

/**
 * Roster health chip (Fitness Operations). Order matters:
 * completed > needs_follow_up > in_progress (first week) > on_track.
 * Needs follow-up: 2+ misses in the last 7 days, adherence under 60% once 5+
 * workouts were due, or no completion in 4+ days after the opening days.
 */
export function derivePlanHealth(
  plan: FitnessPlanLite,
  days: WorkoutDayLite[],
  now: Date = new Date(),
): FitnessHealth {
  if (plan.status === "completed") return "completed";
  const dayNo = planDayNumber(plan, now);
  if (plan.status === "active" && dayNo >= plan.durationDays) {
    const allDone = days.every((d) => d.isRestDay || d.completedAt);
    if (allDone) return "completed";
  }

  const today = istStartOfDay(now).getTime();
  const sevenDaysAgo = today - 7 * 24 * 60 * 60 * 1000;
  const missedLast7 = days.filter((d) => {
    const t = dayStart(d.date);
    return t >= sevenDaysAgo && t < today && !d.isRestDay && !d.completedAt;
  }).length;

  const adherence = workoutAdherence(days, now);
  const lastDone = days
    .filter((d) => d.completedAt)
    .map((d) => dayStart(d.date))
    .sort((a, b) => b - a)[0];
  const staleDays = lastDone != null ? Math.floor((today - lastDone) / (24 * 60 * 60 * 1000)) : null;

  const needsFollowUp =
    missedLast7 >= 2 ||
    (adherence.due >= 5 && (adherence.pct ?? 100) < 60) ||
    (dayNo > 3 && (staleDays == null ? adherence.due > 0 : staleDays >= 4));
  if (needsFollowUp) return "needs_follow_up";
  if (dayNo <= 7) return "in_progress";
  return "on_track";
}

/** ISO-agnostic week number within a plan (1-based) for a given date. */
export function planWeekNumber(plan: FitnessPlanLite, now: Date = new Date()): number {
  return Math.max(1, Math.ceil(planDayNumber(plan, now) / 7));
}

// ---- Plan templates ---------------------------------------------------------

export interface TemplateExercise {
  name: string;
  sets?: number;
  reps?: number;
  durationSec?: number;
  equipment?: string;
}

export interface TemplateDay {
  title: string;
  isRestDay: boolean;
  exercises: TemplateExercise[];
}

export interface FitnessTemplate {
  key: string;
  label: string;
  goalHint: string;
  /** 7-day repeating pattern, applied from day 1 regardless of weekday. */
  weekly: TemplateDay[];
}

const rest = (title = "Rest & Recovery"): TemplateDay => ({ title, isRestDay: true, exercises: [] });

export const FITNESS_TEMPLATES: FitnessTemplate[] = [
  {
    key: "fat_loss",
    label: "Fat Loss & Stamina",
    goalHint: "Fat loss & better stamina",
    weekly: [
      {
        title: "Upper Body + Core",
        isRestDay: false,
        exercises: [
          { name: "Push-ups", sets: 3, reps: 12, equipment: "Bodyweight" },
          { name: "Dumbbell Shoulder Press", sets: 3, reps: 10, equipment: "Dumbbell" },
          { name: "Lat Pulldown", sets: 3, reps: 12, equipment: "Machine" },
          { name: "Plank", sets: 3, durationSec: 45, equipment: "Bodyweight" },
          { name: "Walk / Light Cardio", durationSec: 900, equipment: "Cardio" },
        ],
      },
      {
        title: "Lower Body",
        isRestDay: false,
        exercises: [
          { name: "Bodyweight Squats", sets: 3, reps: 15, equipment: "Bodyweight" },
          { name: "Lunges", sets: 3, reps: 12, equipment: "Bodyweight" },
          { name: "Glute Bridge", sets: 3, reps: 15, equipment: "Bodyweight" },
          { name: "Calf Raises", sets: 3, reps: 20, equipment: "Bodyweight" },
          { name: "Walk / Light Cardio", durationSec: 900, equipment: "Cardio" },
        ],
      },
      {
        title: "Cardio + Core",
        isRestDay: false,
        exercises: [
          { name: "Brisk Walk or Jog", durationSec: 1500, equipment: "Cardio" },
          { name: "Mountain Climbers", sets: 3, reps: 20, equipment: "Bodyweight" },
          { name: "Russian Twists", sets: 3, reps: 20, equipment: "Bodyweight" },
          { name: "Plank", sets: 3, durationSec: 45, equipment: "Bodyweight" },
        ],
      },
      rest(),
      {
        title: "Full Body Circuit",
        isRestDay: false,
        exercises: [
          { name: "Squat to Press", sets: 3, reps: 12, equipment: "Dumbbell" },
          { name: "Push-ups", sets: 3, reps: 12, equipment: "Bodyweight" },
          { name: "Bent-over Row", sets: 3, reps: 12, equipment: "Dumbbell" },
          { name: "Jumping Jacks", sets: 3, durationSec: 45, equipment: "Bodyweight" },
        ],
      },
      {
        title: "Active Recovery Walk",
        isRestDay: false,
        exercises: [
          { name: "Long Walk", durationSec: 1800, equipment: "Cardio" },
          { name: "Full-body Stretch", durationSec: 600, equipment: "Bodyweight" },
        ],
      },
      rest(),
    ],
  },
  {
    key: "strength",
    label: "Strength & Muscle",
    goalHint: "Build strength & tone",
    weekly: [
      {
        title: "Push Day",
        isRestDay: false,
        exercises: [
          { name: "Bench / Floor Press", sets: 4, reps: 8, equipment: "Dumbbell" },
          { name: "Overhead Press", sets: 3, reps: 10, equipment: "Dumbbell" },
          { name: "Incline Push-ups", sets: 3, reps: 12, equipment: "Bodyweight" },
          { name: "Tricep Dips", sets: 3, reps: 10, equipment: "Bodyweight" },
        ],
      },
      {
        title: "Pull Day",
        isRestDay: false,
        exercises: [
          { name: "Lat Pulldown", sets: 4, reps: 10, equipment: "Machine" },
          { name: "Seated Row", sets: 3, reps: 12, equipment: "Machine" },
          { name: "Bicep Curls", sets: 3, reps: 12, equipment: "Dumbbell" },
          { name: "Face Pulls", sets: 3, reps: 15, equipment: "Cable" },
        ],
      },
      rest(),
      {
        title: "Leg Day",
        isRestDay: false,
        exercises: [
          { name: "Goblet Squats", sets: 4, reps: 10, equipment: "Dumbbell" },
          { name: "Romanian Deadlift", sets: 3, reps: 10, equipment: "Dumbbell" },
          { name: "Walking Lunges", sets: 3, reps: 12, equipment: "Bodyweight" },
          { name: "Calf Raises", sets: 3, reps: 20, equipment: "Bodyweight" },
        ],
      },
      {
        title: "Upper Body + Core",
        isRestDay: false,
        exercises: [
          { name: "Push-ups", sets: 3, reps: 15, equipment: "Bodyweight" },
          { name: "Dumbbell Row", sets: 3, reps: 12, equipment: "Dumbbell" },
          { name: "Hanging Knee Raises", sets: 3, reps: 10, equipment: "Bar" },
          { name: "Plank", sets: 3, durationSec: 60, equipment: "Bodyweight" },
        ],
      },
      {
        title: "Conditioning Walk",
        isRestDay: false,
        exercises: [
          { name: "Brisk Walk", durationSec: 1800, equipment: "Cardio" },
          { name: "Full-body Stretch", durationSec: 600, equipment: "Bodyweight" },
        ],
      },
      rest(),
    ],
  },
  {
    key: "general",
    label: "General Fitness",
    goalHint: "Overall fitness & energy",
    weekly: [
      {
        title: "Full Body Basics",
        isRestDay: false,
        exercises: [
          { name: "Bodyweight Squats", sets: 3, reps: 12, equipment: "Bodyweight" },
          { name: "Push-ups", sets: 3, reps: 10, equipment: "Bodyweight" },
          { name: "Plank", sets: 3, durationSec: 30, equipment: "Bodyweight" },
          { name: "Walk", durationSec: 1200, equipment: "Cardio" },
        ],
      },
      {
        title: "Cardio + Mobility",
        isRestDay: false,
        exercises: [
          { name: "Brisk Walk or Cycle", durationSec: 1500, equipment: "Cardio" },
          { name: "Hip Openers", durationSec: 300, equipment: "Bodyweight" },
          { name: "Shoulder Mobility", durationSec: 300, equipment: "Bodyweight" },
        ],
      },
      rest(),
      {
        title: "Strength Basics",
        isRestDay: false,
        exercises: [
          { name: "Goblet Squats", sets: 3, reps: 10, equipment: "Dumbbell" },
          { name: "Dumbbell Row", sets: 3, reps: 10, equipment: "Dumbbell" },
          { name: "Glute Bridge", sets: 3, reps: 12, equipment: "Bodyweight" },
        ],
      },
      {
        title: "Core + Cardio",
        isRestDay: false,
        exercises: [
          { name: "Dead Bug", sets: 3, reps: 10, equipment: "Bodyweight" },
          { name: "Side Plank", sets: 2, durationSec: 30, equipment: "Bodyweight" },
          { name: "Walk", durationSec: 1500, equipment: "Cardio" },
        ],
      },
      {
        title: "Light Activity",
        isRestDay: false,
        exercises: [
          { name: "Long Walk", durationSec: 1800, equipment: "Cardio" },
          { name: "Stretching", durationSec: 600, equipment: "Bodyweight" },
        ],
      },
      rest(),
    ],
  },
];

export function fitnessTemplate(key: string): FitnessTemplate | undefined {
  return FITNESS_TEMPLATES.find((t) => t.key === key);
}

export interface GeneratedDay {
  dayIndex: number;
  date: Date;
  title: string;
  isRestDay: boolean;
  exercises: TemplateExercise[];
}

/**
 * Expand a template into concrete plan days. The weekly pattern repeats from
 * day 1 (it is not anchored to weekdays — a plan can start any day). Dates are
 * IST day-start instants.
 */
export function buildPlanDays(
  templateKey: string,
  startDate: Date,
  durationDays: number,
): GeneratedDay[] {
  const tpl = fitnessTemplate(templateKey);
  const start = istStartOfDay(startDate);
  return Array.from({ length: durationDays }, (_, i) => {
    const pattern = tpl?.weekly[i % 7] ?? { title: "Workout", isRestDay: false, exercises: [] };
    return {
      dayIndex: i + 1,
      date: istAddDays(start, i),
      title: pattern.title,
      isRestDay: pattern.isRestDay,
      exercises: pattern.exercises,
    };
  });
}

/** Display helper: "3 × 12", "3 × 45 sec" or "15 min". */
export function exercisePrescription(e: {
  sets?: number | null;
  reps?: number | null;
  durationSec?: number | null;
}): string {
  if (e.sets && e.reps) return `${e.sets} × ${e.reps}`;
  if (e.sets && e.durationSec) return `${e.sets} × ${e.durationSec} sec`;
  if (e.durationSec) return `${Math.round(e.durationSec / 60)} min`;
  return "—";
}
