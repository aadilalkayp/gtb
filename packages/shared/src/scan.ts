/**
 * Transformation Readiness Scan — shared types + roadmap generation.
 *
 * Pure date math (no DB access), mirroring scheduling.ts, so the roadmap can be
 * generated server-side at claim/rescan time and previewed client-side.
 * Scores are 0–100 appearance ratings — analysis, never diagnosis: the score
 * shape has no field a medical condition could fit in.
 */
import { addDays } from "./scheduling.js";

export const SCAN_CATEGORIES = ["skin", "hair", "beard", "style"] as const;
export type ScanCategory = (typeof SCAN_CATEGORIES)[number];

export const SCAN_CATEGORY_LABELS: Record<ScanCategory, string> = {
  skin: "Skin",
  hair: "Hair",
  beard: "Beard",
  style: "Style",
};

export interface ScanScores {
  skinScore: number;
  hairScore: number;
  beardScore: number;
  styleScore: number;
  readinessScore: number;
}

export interface FocusArea {
  /** e.g. "pigmentation", "hydration", "beard shaping" */
  area: string;
  /** Percentage weight; a scan's focus areas sum to 100. */
  weight: number;
}

/** Blend category scores into the headline readiness score. Skin carries the
 *  most visual weight in wedding photos; style is the most coachable. */
export function computeReadiness(s: Omit<ScanScores, "readinessScore">): number {
  const value = 0.35 * s.skinScore + 0.25 * s.hairScore + 0.2 * s.beardScore + 0.2 * s.styleScore;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Roadmap generation
// ---------------------------------------------------------------------------

export interface RoadmapItemInput {
  kind: "weekly_focus" | "checklist";
  category: ScanCategory | "logistics";
  title: string;
  description?: string;
  dueDate: Date;
  weekNumber?: number;
}

/** Fixed prep-checklist milestones, offset in days before the wedding. Items
 *  whose slot has already passed at generation time are simply skipped. */
const CHECKLIST_TEMPLATE: { daysBefore: number; title: string; description: string }[] = [
  {
    daysBefore: 90,
    title: "Lock your grooming routine",
    description:
      "Start the daily skincare and haircare routine from your scan report — results need runway.",
  },
  {
    daysBefore: 60,
    title: "Outfit shopping",
    description:
      "Finalize your wedding outfit direction and start shopping — alterations take time.",
  },
  {
    daysBefore: 45,
    title: "Hairstyle trial",
    description:
      "Trial your wedding haircut now so there's one more grow-out cycle before the day.",
  },
  {
    daysBefore: 30,
    title: "Suit / sherwani trial",
    description: "First full fitting. Book the alteration follow-up before you leave.",
  },
  {
    daysBefore: 21,
    title: "Shoes & accessories",
    description: "Buy shoes now and break them in. Match accessories to the finalized outfit.",
  },
  {
    daysBefore: 14,
    title: "Facial / clean-up",
    description: "Last deep facial — never closer than two weeks to the wedding, so skin settles.",
  },
  {
    daysBefore: 10,
    title: "Perfume & grooming kit",
    description: "Pick the wedding fragrance and assemble the day-of grooming kit.",
  },
  {
    daysBefore: 7,
    title: "Documents & logistics",
    description: "IDs, bookings, vendor contacts — one folder, one backup.",
  },
  {
    daysBefore: 5,
    title: "Final haircut & beard shape-up",
    description: "The wedding cut. Close enough to look sharp, far enough to soften.",
  },
  {
    daysBefore: 3,
    title: "Packing",
    description: "Pack for the wedding and honeymoon. Tick off the grooming kit.",
  },
  {
    daysBefore: 1,
    title: "Rest & prep",
    description: "Hydrate, sleep early, lay out everything for tomorrow. You're ready.",
  },
];

/** Weekly focus task bank per category — rotated so consecutive weeks vary. */
const WEEKLY_TASKS: Record<ScanCategory, { title: string; description: string }[]> = {
  skin: [
    {
      title: "Daily skincare discipline",
      description:
        "Cleanser morning and night, moisturizer after, sunscreen every morning — no skipped days this week.",
    },
    {
      title: "Hydration week",
      description: "3L of water daily and moisturizer twice a day. Skin clarity follows hydration.",
    },
    {
      title: "Targeted care",
      description:
        "Work your top focus area from the scan with the recommended routine, every day this week.",
    },
    {
      title: "Sleep for your skin",
      description:
        "7+ hours nightly this week — dark circles respond to sleep faster than to any product.",
    },
  ],
  hair: [
    {
      title: "Scalp care week",
      description: "Oil or scalp treatment twice this week; wash routine on alternate days.",
    },
    {
      title: "Style practice",
      description:
        "Practice your intended wedding style twice this week so it's routine by the big day.",
    },
    {
      title: "Trim check",
      description:
        "Assess length against the wedding-day plan; book a shaping trim if you're ahead of schedule.",
    },
  ],
  beard: [
    {
      title: "Beard line maintenance",
      description: "Clean up neckline and cheek lines; comb and oil daily this week.",
    },
    {
      title: "Density care",
      description: "Beard oil nightly and gentle exfoliation twice this week to keep growth even.",
    },
    {
      title: "Shape rehearsal",
      description:
        "Define the exact wedding beard shape and maintain it all week — no experiments after this.",
    },
  ],
  style: [
    {
      title: "Fit audit",
      description:
        "Try your shortlisted outfits; note what needs tailoring. Fit beats fabric, always.",
    },
    {
      title: "Color matching",
      description: "Hold shortlisted colors against your skin tone in daylight; keep the two best.",
    },
    {
      title: "Grooming details",
      description: "Nails, brows, ears — the details cameras find. Twenty minutes, once this week.",
    },
  ],
};

/** Brides: the "beard" category column carries brows & lashes. */
const BRIDE_BROW_TASKS: { title: string; description: string }[] = [
  {
    title: "Brow shaping",
    description:
      "Tidy stray hairs and define the arch; book a professional shaping if it's been a month.",
  },
  {
    title: "Lash & brow care",
    description: "Castor or lash serum nightly this week; brush brows every morning.",
  },
  {
    title: "Eye-area rehearsal",
    description:
      "Trial your wedding brow and lash look once this week so there are no day-of surprises.",
  },
];

function bankFor(type: ScanClientType, category: ScanCategory) {
  if (type === "bride" && category === "beard") return BRIDE_BROW_TASKS;
  return WEEKLY_TASKS[category];
}

/**
 * Generate the full roadmap for a client from their scan focus + wedding date.
 *
 * Weekly focus items: one per week from `start` until the wedding (capped at 13
 * weeks ≈ 90 days), weighted toward the scan's weakest categories. Checklist
 * milestones: fixed date offsets, skipping any already in the past.
 */
export function generateRoadmap(args: {
  weddingDate: Date;
  start: Date;
  scores: { skinScore: number; hairScore: number; beardScore: number; styleScore: number | null };
  /** Picks the task bank for the third category (beard vs brows). Defaults to groom. */
  type?: ScanClientType;
}): RoadmapItemInput[] {
  const { weddingDate, start } = args;
  const type: ScanClientType = args.type ?? "groom";
  const items: RoadmapItemInput[] = [];
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysToWedding = Math.floor((weddingDate.getTime() - start.getTime()) / msPerDay);
  if (daysToWedding <= 0) return items;

  // Checklist milestones still ahead of us.
  for (const m of CHECKLIST_TEMPLATE) {
    if (m.daysBefore <= daysToWedding) {
      items.push({
        kind: "checklist",
        category: "logistics",
        title: m.title,
        description: m.description,
        dueDate: addDays(weddingDate, -m.daysBefore),
      });
    }
  }

  // Weekly focus: weakest categories get the most weeks. Build a category
  // sequence proportional to (100 - score), then deal tasks round-robin from
  // each category's bank.
  const weeks = Math.min(Math.floor(daysToWedding / 7), 13);
  const ranked = (Object.keys(WEEKLY_TASKS) as ScanCategory[])
    // Style is only scored with a full-body photo; unknown ≠ weak.
    .filter((c) => c !== "style" || args.scores.styleScore != null)
    .map((c) => ({ c, gap: 100 - (scoreFor(args.scores, c) ?? 100) }))
    .sort((a, b) => b.gap - a.gap);
  const totalGap = ranked.reduce((s, r) => s + r.gap, 0) || 1;
  const sequence: ScanCategory[] = [];
  for (const { c, gap } of ranked) {
    const n = Math.max(1, Math.round((gap / totalGap) * weeks));
    for (let i = 0; i < n; i++) sequence.push(c);
  }

  const used: Record<ScanCategory, number> = { skin: 0, hair: 0, beard: 0, style: 0 };
  for (let w = 0; w < weeks; w++) {
    const category = sequence[w % sequence.length] ?? "skin";
    const bank = bankFor(type, category);
    const task = bank[used[category] % bank.length];
    used[category] += 1;
    if (!task) continue;
    items.push({
      kind: "weekly_focus",
      category,
      title: task.title,
      description: task.description,
      dueDate: addDays(start, (w + 1) * 7),
      weekNumber: w + 1,
    });
  }

  return items;
}

function scoreFor(
  s: { skinScore: number; hairScore: number; beardScore: number; styleScore: number | null },
  c: ScanCategory,
): number | null {
  switch (c) {
    case "skin":
      return s.skinScore;
    case "hair":
      return s.hairScore;
    case "beard":
      return s.beardScore;
    case "style":
      return s.styleScore;
  }
}

// ---------------------------------------------------------------------------
// Phase 5 — client type, attributes, self-report, composite Groom Score
// ---------------------------------------------------------------------------

export type ScanClientType = "groom" | "bride";

/** Category labels differ by client type: the "beard" column carries brows &
 *  lashes grooming for brides. Column names stay stable; labels don't. */
export function scanCategoryLabels(type: ScanClientType): Record<ScanCategory, string> {
  return type === "bride"
    ? { skin: "Skin", hair: "Hair", beard: "Brows & lashes", style: "Style" }
    : { skin: "Skin", hair: "Hair", beard: "Beard", style: "Style" };
}

/** Attribute-level appearance metrics (Step 2 of the brief). Neutral names by
 *  design — "tone evenness", never a condition. Keys are stable identifiers
 *  the vision model fills; labels are what users see. */
export interface ScanAttribute {
  key: string;
  label: string;
  /** 0–100 appearance rating. */
  score: number;
}

export const SCAN_ATTRIBUTE_KEYS = {
  groom: [
    ["toneEvenness", "Tone evenness"],
    ["skinClarity", "Skin clarity"],
    ["hydrationLook", "Hydration look"],
    ["shineBalance", "Shine balance"],
    ["underEye", "Under-eye freshness"],
    ["hairDensity", "Hair density"],
    ["hairNeatness", "Hair neatness"],
    ["beardDensity", "Beard density"],
    ["beardEdges", "Beard edges"],
    ["smile", "Smile & expression"],
  ],
  bride: [
    ["toneEvenness", "Tone evenness"],
    ["skinClarity", "Skin clarity"],
    ["hydrationLook", "Hydration look"],
    ["shineBalance", "Shine balance"],
    ["underEye", "Under-eye freshness"],
    ["hairDensity", "Hair density"],
    ["hairNeatness", "Hair neatness"],
    ["browShape", "Brow shape"],
    ["lashDefinition", "Lash definition"],
    ["smile", "Smile & expression"],
  ],
} as const satisfies Record<ScanClientType, readonly (readonly [string, string])[]>;

export function attributeLabel(type: ScanClientType, key: string): string {
  const found = SCAN_ATTRIBUTE_KEYS[type].find(([k]) => k === key);
  return found ? found[1] : key;
}

/** Appearance readiness with an optional Style score (Style is unlocked only by
 *  a full-body photo). Missing categories renormalize the remaining weights. */
export function computeAppearanceReadiness(s: {
  skinScore: number;
  hairScore: number;
  beardScore: number;
  styleScore: number | null;
}): number {
  const parts: [number, number][] = [
    [0.35, s.skinScore],
    [0.25, s.hairScore],
    [0.2, s.beardScore],
  ];
  if (s.styleScore != null) parts.push([0.2, s.styleScore]);
  const totalW = parts.reduce((acc, [w]) => acc + w, 0);
  const value = parts.reduce((acc, [w, v]) => acc + (w / totalW) * v, 0);
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** The short self-assessment behind the Fitness and Confidence scores. Every
 *  answer is optional; scores derive from whatever was answered. */
export interface SelfReport {
  fitnessLevel?: "beginner" | "intermediate" | "advanced";
  /** Typical workouts per week, 0–7. */
  workoutsPerWeek?: number;
  /** Typical hours of sleep, 3–10. */
  sleepHours?: number;
  /** Litres of water a day, 0–5. */
  waterLitres?: number;
  /** 1–5 Likert answers. */
  photoComfort?: number;
  styleConfidence?: number;
  routineConsistency?: number;
  socialEase?: number;
}

export const SELF_REPORT_QUESTIONS = {
  fitness: [
    { key: "fitnessLevel", label: "How would you describe your fitness right now?", kind: "level" },
    { key: "workoutsPerWeek", label: "Workouts in a typical week", kind: "range", min: 0, max: 7 },
    {
      key: "sleepHours",
      label: "Hours of sleep on a typical night",
      kind: "range",
      min: 3,
      max: 10,
    },
    {
      key: "waterLitres",
      label: "Litres of water on a typical day",
      kind: "range",
      min: 0,
      max: 5,
      step: 0.5,
    },
  ],
  confidence: [
    { key: "photoComfort", label: "I'm comfortable being photographed", kind: "likert" },
    { key: "styleConfidence", label: "I know what looks good on me", kind: "likert" },
    { key: "routineConsistency", label: "I stick to a grooming routine", kind: "likert" },
    { key: "socialEase", label: "I feel at ease in a room full of people", kind: "likert" },
  ],
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0–100 from self-reported activity, sleep and hydration. Null when nothing
 *  relevant was answered. */
export function computeFitnessScore(r: SelfReport | null | undefined): number | null {
  if (!r) return null;
  const parts: number[] = [];
  if (r.fitnessLevel)
    parts.push({ beginner: 0.35, intermediate: 0.65, advanced: 0.9 }[r.fitnessLevel]);
  if (r.workoutsPerWeek != null) parts.push(clamp01(r.workoutsPerWeek / 5));
  if (r.sleepHours != null) parts.push(clamp01(1 - Math.abs(r.sleepHours - 7.5) / 3.5));
  if (r.waterLitres != null) parts.push(clamp01(r.waterLitres / 3));
  if (!parts.length) return null;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.round(20 + avg * 80);
}

/** 0–100 from the four Likert answers. Null when none answered. */
export function computeConfidenceScore(r: SelfReport | null | undefined): number | null {
  if (!r) return null;
  const answers = [r.photoComfort, r.styleConfidence, r.routineConsistency, r.socialEase].filter(
    (v): v is number => typeof v === "number",
  );
  if (!answers.length) return null;
  const avg = answers.reduce((a, b) => a + b, 0) / answers.length; // 1..5
  return Math.round(((avg - 1) / 4) * 100);
}

/** Share of roadmap items due by `now` that are done. Null until the first
 *  item is actually due — a fresh lead's headline must not drop on day 0 for
 *  tasks that aren't yet expected of them. After that, every on-time tick
 *  counts and every missed one shows. */
export function computePrepProgress(
  items: { dueDate: Date | string; isDone: boolean }[],
  now: Date = new Date(),
): number | null {
  const due = items.filter((i) => new Date(i.dueDate).getTime() <= now.getTime());
  if (!due.length) return null;
  return Math.round((due.filter((i) => i.isDone).length / due.length) * 100);
}

export interface GroomScoreInput {
  appearance: number;
  fitness: number | null;
  confidence: number | null;
  prepProgress: number | null;
}

export interface GroomScore {
  /** The headline "Wedding Readiness" — moves with every scan AND every ticked task. */
  overall: number;
  /** Which inputs were present; the UI uses this for "unlock" prompts. */
  inputs: { fitness: boolean; confidence: boolean; prep: boolean };
}

/** Composite Groom Score. Weights renormalize over the inputs actually
 *  present, so a lead with only a selfie still gets an honest number and
 *  every added input (photo, questions, ticked tasks) moves it. */
export function computeGroomScore(i: GroomScoreInput): GroomScore {
  const parts: [number, number][] = [[0.55, i.appearance]];
  if (i.fitness != null) parts.push([0.15, i.fitness]);
  if (i.confidence != null) parts.push([0.1, i.confidence]);
  if (i.prepProgress != null) parts.push([0.2, i.prepProgress]);
  const totalW = parts.reduce((acc, [w]) => acc + w, 0);
  const overall = Math.round(parts.reduce((acc, [w, v]) => acc + (w / totalW) * v, 0));
  return {
    overall: Math.max(0, Math.min(100, overall)),
    inputs: {
      fitness: i.fitness != null,
      confidence: i.confidence != null,
      prep: i.prepProgress != null,
    },
  };
}
