/**
 * Styling Blueprint logic (STYLING_BLUEPRINT.md, GTB brief Oct 2026).
 *
 * The stylist edits a draft spread over several tables; publishing freezes it
 * into a BlueprintSnapshot that the client portal, the PDF and the staff
 * preview all render. `buildBlueprintSnapshot` is the one place that turns a
 * draft into that shape, so preview and publish can never disagree.
 */
import { istAddDays, istDateParts, istStartOfDay } from "./format.js";

// ---- Workflow ---------------------------------------------------------------

export const BLUEPRINT_STATUSES = [
  "awaiting_photos",
  "under_review",
  "retake_requested",
  "published",
] as const;
export type BlueprintStatus = (typeof BLUEPRINT_STATUSES)[number];

/** Stored statuses plus the derived "archived" (programme ended). */
export type BlueprintDisplayStatus = BlueprintStatus | "archived";

export const BLUEPRINT_STATUS_LABELS: Record<BlueprintDisplayStatus, string> = {
  awaiting_photos: "Awaiting photos",
  under_review: "Under review",
  retake_requested: "Retake requested",
  published: "Published",
  archived: "Archived",
};

/** Programme over: the Blueprint turns read-only for everyone. */
export function isBlueprintArchived(clientStatus: string | null | undefined): boolean {
  return clientStatus === "completed" || clientStatus === "cancelled";
}

export function blueprintDisplayStatus(
  status: BlueprintStatus,
  clientStatus: string | null | undefined,
): BlueprintDisplayStatus {
  return isBlueprintArchived(clientStatus) ? "archived" : status;
}

/** Working days the stylist has to return a Blueprint after photos arrive. */
export const BLUEPRINT_TURNAROUND_WORKING_DAYS = 5;

function istWeekday(d: Date): number {
  const { y, m, day } = istDateParts(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/**
 * Start of the IST day that is `n` working days (Mon to Fri) after `from`.
 * A Blueprint is late once that whole day has passed.
 */
export function addWorkingDays(from: Date, n: number): Date {
  let d = istStartOfDay(from);
  let added = 0;
  while (added < n) {
    d = istAddDays(d, 1);
    const wd = istWeekday(d);
    if (wd !== 0 && wd !== 6) added += 1;
  }
  return d;
}

export function blueprintDueAt(submittedAt: Date): Date {
  return addWorkingDays(submittedAt, BLUEPRINT_TURNAROUND_WORKING_DAYS);
}

/** True once the due day has fully passed (IST). */
export function isBlueprintLate(
  dueAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!dueAt) return false;
  return istStartOfDay(now).getTime() > new Date(dueAt).getTime();
}

/** Statuses where the stylist owes the client a (new) Blueprint. */
export function isAwaitingStylist(status: BlueprintStatus): boolean {
  return status === "under_review" || status === "retake_requested";
}

// ---- Photos -----------------------------------------------------------------

export const STYLING_PHOTO_SLOTS = [
  "front",
  "left_side",
  "right_side",
  "back",
  "full_body",
  "extra",
] as const;
export type StylingPhotoSlot = (typeof STYLING_PHOTO_SLOTS)[number];

export const REQUIRED_PHOTO_SLOTS = [
  "front",
  "left_side",
  "right_side",
  "back",
  "full_body",
] as const satisfies readonly StylingPhotoSlot[];

export const MAX_EXTRA_PHOTOS = 6;

export const PHOTO_SLOT_LABELS: Record<StylingPhotoSlot, string> = {
  front: "Front",
  left_side: "Left side",
  right_side: "Right side",
  back: "Back of head",
  full_body: "Full body",
  extra: "Outfit or inspiration",
};

export const PHOTO_SLOT_TIPS: Record<StylingPhotoSlot, string> = {
  front: "Face the camera, shoulders relaxed.",
  left_side: "Turn so your left ear faces the camera.",
  right_side: "Turn so your right ear faces the camera.",
  back: "Ask someone to photograph the back of your head.",
  full_body: "Head to toe, standing straight, in fitted clothes.",
  extra: "A current outfit, or a look you like.",
};

export function missingRequiredSlots(slots: Iterable<string>): StylingPhotoSlot[] {
  const have = new Set(slots);
  return REQUIRED_PHOTO_SLOTS.filter((s) => !have.has(s));
}

// ---- Sections ---------------------------------------------------------------

export const BLUEPRINT_SECTIONS = [
  "profile",
  "direction",
  "looks",
  "hair",
  "colours",
  "outfits",
  "shopping",
  "footwear",
  "eyewear",
  "essentials",
] as const;
export type BlueprintSection = (typeof BLUEPRINT_SECTIONS)[number];

export const BLUEPRINT_SECTION_LABELS: Record<BlueprintSection, string> = {
  profile: "Style Profile",
  direction: "Style Direction",
  looks: "Best Looks",
  hair: "Hair & Beard",
  colours: "Outfit Colours",
  outfits: "Outfit Recommendations",
  shopping: "Shopping List",
  footwear: "Footwear",
  eyewear: "Eyewear",
  essentials: "Big Day Essentials",
};

/** Completion: sections the stylist has marked done, out of all ten. */
export function blueprintCompletion(sectionsDone: readonly string[]): {
  done: number;
  total: number;
  ratio: number;
} {
  const valid = new Set(
    sectionsDone.filter((s) => (BLUEPRINT_SECTIONS as readonly string[]).includes(s)),
  );
  const total = BLUEPRINT_SECTIONS.length;
  return { done: valid.size, total, ratio: valid.size / total };
}

// ---- Items ------------------------------------------------------------------

export const STYLING_ITEM_KINDS = ["outfit", "footwear", "eyewear", "product"] as const;
export type StylingItemKind = (typeof STYLING_ITEM_KINDS)[number];

export const STYLING_ITEM_PRIORITIES = ["must_have", "nice_to_have"] as const;
export type StylingItemPriority = (typeof STYLING_ITEM_PRIORITIES)[number];

export const STYLING_ITEM_PRIORITY_LABELS: Record<StylingItemPriority, string> = {
  must_have: "Must have",
  nice_to_have: "Nice to have",
};

export const SHOPPING_CATEGORIES = ["Outfits", "Accessories", "Grooming", "Essentials"] as const;

export const EYEWEAR_RECOMMENDATIONS = ["Recommended", "Alternative", "Avoid"] as const;

export const STYLING_LIBRARY_KINDS = ["product", "barber_line", "essential"] as const;
export type StylingLibraryKind = (typeof STYLING_LIBRARY_KINDS)[number];

export const STYLING_LIBRARY_KIND_LABELS: Record<StylingLibraryKind, string> = {
  product: "Products",
  barber_line: "Barber brief lines",
  essential: "Big Day Essentials",
};

/** Item kind -> the section it belongs to. */
export const ITEM_KIND_SECTION: Record<StylingItemKind, BlueprintSection> = {
  outfit: "outfits",
  footwear: "footwear",
  eyewear: "eyewear",
  product: "shopping",
};

// ---- Validation helpers -------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** Only plain http(s) links reach the client; anything else is dropped. */
export function safeExternalUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// ---- Snapshot -----------------------------------------------------------------

export interface BlueprintSnapshot {
  profile: {
    faceShape: string | null;
    skinTone: string | null;
    skinToneHex: string | null;
    hairType: string | null;
    beardType: string | null;
    bodyType: string | null;
    heightCm: number | null;
    existingStyle: string | null;
    stylePreferences: string | null;
  };
  direction: { tags: string[]; description: string | null };
  looks: {
    id: string;
    title: string;
    eventLabel: string | null;
    imageDocId: string | null;
    description: string | null;
    outfit: string | null;
    footwear: string | null;
    accessories: string | null;
    colors: string[];
    stylistNote: string | null;
  }[];
  hair: {
    frontDocId: string | null;
    sideDocId: string | null;
    backDocId: string | null;
    barberBrief: string[];
    notes: string | null;
  };
  palettes: { id: string; colors: string[]; label: string; notes: string | null }[];
  items: {
    id: string;
    kind: StylingItemKind;
    name: string;
    category: string | null;
    imageDocId: string | null;
    priceRange: string | null;
    url: string | null;
    priority: StylingItemPriority | null;
    color: string | null;
    fit: string | null;
    recommendation: string | null;
    notes: string | null;
  }[];
  essentials: { id: string; item: string; category: string | null; notes: string | null }[];
}

/** Draft rows as read from the database (extra fields are ignored). */
export interface BlueprintDraft {
  faceShape?: string | null;
  skinTone?: string | null;
  skinToneHex?: string | null;
  hairType?: string | null;
  beardType?: string | null;
  bodyType?: string | null;
  heightCm?: number | null;
  existingStyle?: string | null;
  stylePreferences?: string | null;
  styleTags?: string[];
  styleDescription?: string | null;
  hairFrontDocId?: string | null;
  hairSideDocId?: string | null;
  hairBackDocId?: string | null;
  barberBrief?: string[];
  hairNotes?: string | null;
  looks?: (Omit<BlueprintSnapshot["looks"][number], never> & { sortOrder?: number })[];
  palettes?: (BlueprintSnapshot["palettes"][number] & { sortOrder?: number })[];
  items?: (Omit<BlueprintSnapshot["items"][number], "kind" | "priority"> & {
    kind: string;
    priority: string | null;
    sortOrder?: number;
  })[];
  essentials?: (BlueprintSnapshot["essentials"][number] & { sortOrder?: number })[];
}

function text(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function bySort<T extends { sortOrder?: number }>(rows: T[] | undefined): T[] {
  return [...(rows ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * Normalise a draft into the client-facing shape: trims text, drops blank
 * rows, invalid colours and unsafe links, and orders lists. `allowedDocIds`
 * (when given) limits image references to documents verified to belong to
 * the client; anything else is dropped.
 */
export function buildBlueprintSnapshot(
  draft: BlueprintDraft,
  allowedDocIds?: ReadonlySet<string>,
): BlueprintSnapshot {
  const doc = (id: string | null | undefined): string | null =>
    id && (!allowedDocIds || allowedDocIds.has(id)) ? id : null;
  const lines = (arr: string[] | undefined) => (arr ?? []).map((l) => l.trim()).filter(Boolean);

  return {
    profile: {
      faceShape: text(draft.faceShape),
      skinTone: text(draft.skinTone),
      skinToneHex: isHexColor(draft.skinToneHex) ? draft.skinToneHex!.toLowerCase() : null,
      hairType: text(draft.hairType),
      beardType: text(draft.beardType),
      bodyType: text(draft.bodyType),
      heightCm: draft.heightCm && draft.heightCm > 0 ? draft.heightCm : null,
      existingStyle: text(draft.existingStyle),
      stylePreferences: text(draft.stylePreferences),
    },
    direction: { tags: lines(draft.styleTags), description: text(draft.styleDescription) },
    looks: bySort(draft.looks)
      .filter((l) => text(l.title))
      .map((l) => ({
        id: l.id,
        title: text(l.title)!,
        eventLabel: text(l.eventLabel),
        imageDocId: doc(l.imageDocId),
        description: text(l.description),
        outfit: text(l.outfit),
        footwear: text(l.footwear),
        accessories: text(l.accessories),
        colors: (l.colors ?? []).filter(isHexColor).map((c) => c.toLowerCase()),
        stylistNote: text(l.stylistNote),
      })),
    hair: {
      frontDocId: doc(draft.hairFrontDocId),
      sideDocId: doc(draft.hairSideDocId),
      backDocId: doc(draft.hairBackDocId),
      barberBrief: lines(draft.barberBrief),
      notes: text(draft.hairNotes),
    },
    palettes: bySort(draft.palettes)
      .map((p) => ({
        id: p.id,
        colors: (p.colors ?? []).filter(isHexColor).map((c) => c.toLowerCase()),
        label: text(p.label) ?? "",
        notes: text(p.notes),
      }))
      .filter((p) => p.label && p.colors.length),
    items: bySort(draft.items)
      .filter((i) => text(i.name) && (STYLING_ITEM_KINDS as readonly string[]).includes(i.kind))
      .map((i) => ({
        id: i.id,
        kind: i.kind as StylingItemKind,
        name: text(i.name)!,
        category: text(i.category),
        imageDocId: doc(i.imageDocId),
        priceRange: text(i.priceRange),
        url: safeExternalUrl(i.url),
        priority: (STYLING_ITEM_PRIORITIES as readonly string[]).includes(i.priority ?? "")
          ? (i.priority as StylingItemPriority)
          : null,
        color: text(i.color),
        fit: text(i.fit),
        recommendation: text(i.recommendation),
        notes: text(i.notes),
      })),
    essentials: bySort(draft.essentials)
      .filter((e) => text(e.item))
      .map((e) => ({
        id: e.id,
        item: text(e.item)!,
        category: text(e.category),
        notes: text(e.notes),
      })),
  };
}

/** Every image a snapshot shows, for signing and validation. */
export function snapshotImageIds(s: BlueprintSnapshot): string[] {
  const ids = [
    s.hair.frontDocId,
    s.hair.sideDocId,
    s.hair.backDocId,
    ...s.looks.map((l) => l.imageDocId),
    ...s.items.map((i) => i.imageDocId),
  ];
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
}

/** Which sections have content in a snapshot. Empty ones are hidden from the client. */
export function snapshotSectionHasContent(s: BlueprintSnapshot): Record<BlueprintSection, boolean> {
  const p = s.profile;
  const kinds = (k: StylingItemKind) => s.items.some((i) => i.kind === k);
  return {
    profile: Boolean(
      p.faceShape ||
      p.skinTone ||
      p.hairType ||
      p.beardType ||
      p.bodyType ||
      p.heightCm ||
      p.existingStyle ||
      p.stylePreferences,
    ),
    direction: s.direction.tags.length > 0 || Boolean(s.direction.description),
    looks: s.looks.length > 0,
    hair: Boolean(
      s.hair.frontDocId ||
      s.hair.sideDocId ||
      s.hair.backDocId ||
      s.hair.barberBrief.length ||
      s.hair.notes,
    ),
    colours: s.palettes.length > 0,
    outfits: kinds("outfit"),
    shopping: kinds("product"),
    footwear: kinds("footwear"),
    eyewear: kinds("eyewear"),
    essentials: s.essentials.length > 0,
  };
}

export function emptySections(s: BlueprintSnapshot): BlueprintSection[] {
  const has = snapshotSectionHasContent(s);
  return BLUEPRINT_SECTIONS.filter((k) => !has[k]);
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** True when the draft would publish exactly what the client already sees. */
export function snapshotsEqual(
  a: BlueprintSnapshot | null | undefined,
  b: BlueprintSnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
