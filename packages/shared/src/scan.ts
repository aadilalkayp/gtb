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
  scores: Omit<ScanScores, "readinessScore">;
}): RoadmapItemInput[] {
  const { weddingDate, start } = args;
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
    .map((c) => ({ c, gap: 100 - scoreFor(args.scores, c) }))
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
    const bank = WEEKLY_TASKS[category];
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

function scoreFor(s: Omit<ScanScores, "readinessScore">, c: ScanCategory): number {
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
