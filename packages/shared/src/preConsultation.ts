import { z } from "zod";

/**
 * Pre-Consultation Assessment (GTB spec, Oct 2026): the short onboarding form
 * the client fills before their consultation. Shared by the portal form, the
 * submit route (server-side validation), the staff view and the PDF.
 *
 * Earlier assessments used older vocabularies (fitnessLevel, multi-select
 * fitnessGoals, styling questions). Those columns are kept for existing
 * clients; `preConsultLabel` falls back to a humanised value for them.
 */

export const PRECONSULT_SKIN_TYPES = [
  "normal",
  "dry",
  "oily",
  "combination",
  "sensitive",
  "not_sure",
] as const;

export const PRECONSULT_SKIN_CONCERNS = [
  "acne",
  "acne_marks",
  "pigmentation",
  "dark_circles",
  "uneven_tone",
  "dullness",
  "excess_oil",
  "dryness",
  "uneven_texture",
  "other",
] as const;

export const MAX_SKIN_CONCERNS = 3;

export const ACTIVITY_LEVELS = [
  "mostly_inactive",
  "lightly_active",
  "moderately_active",
  "very_active",
] as const;

export const PRECONSULT_FITNESS_GOALS = [
  "weight_loss",
  "muscle_gain",
  "fat_loss_muscle_gain",
  "toning",
  "general_fitness",
  "strength",
  "stamina",
  "other",
] as const;

export const PRECONSULT_DIETARY_PREFERENCES = [
  "no_preference",
  "vegetarian",
  "eggetarian",
  "non_veg",
  "vegan",
  "other",
] as const;

/** Skin photo angles, in the order they are asked for and printed. */
export const SKIN_PHOTO_ANGLES = ["front", "left", "right"] as const;
export type SkinPhotoAngle = (typeof SKIN_PHOTO_ANGLES)[number];

export const SKIN_PHOTO_ANGLE_LABELS: Record<SkinPhotoAngle, string> = {
  front: "Front view",
  left: "Left side view",
  right: "Right side view",
};

export const SKIN_PHOTO_ANGLE_HINTS: Record<SkinPhotoAngle, string> = {
  front: "Face directly facing the camera",
  left: "Turn your face to the left",
  right: "Turn your face to the right",
};

export const SKIN_PHOTO_REQUIREMENTS = [
  "Use your phone's normal camera",
  "No beauty filters",
  "No editing or retouching",
  "Good natural or bright, even lighting",
  "Take the photo from a close and clear distance",
  "Upload the original HD image",
  "Keep the face completely visible",
  "No cap or hat",
  "No sunglasses or face-covering eyewear",
  "Avoid makeup where possible",
  "Keep the face relaxed",
  "Make sure the image is sharp and in focus",
] as const;

const LABELS: Record<string, string> = {
  // skin type
  normal: "Normal",
  dry: "Dry",
  oily: "Oily",
  combination: "Combination",
  sensitive: "Sensitive",
  not_sure: "Not sure",
  // concerns
  acne: "Acne / Breakouts",
  acne_marks: "Acne marks",
  pigmentation: "Pigmentation / Dark spots",
  dark_circles: "Dark circles",
  uneven_tone: "Uneven skin tone",
  dullness: "Dullness",
  excess_oil: "Excess oil",
  dryness: "Dryness",
  uneven_texture: "Uneven texture",
  // activity
  mostly_inactive: "Mostly inactive",
  lightly_active: "Lightly active",
  moderately_active: "Moderately active",
  very_active: "Very active",
  // goals
  weight_loss: "Weight loss",
  muscle_gain: "Muscle gain",
  fat_loss_muscle_gain: "Fat loss + muscle gain",
  toning: "Toning / Body recomposition",
  general_fitness: "General fitness",
  strength: "Strength",
  stamina: "Stamina / Endurance",
  // diet
  no_preference: "No specific preference",
  vegetarian: "Vegetarian",
  eggetarian: "Eggetarian",
  non_veg: "Non-vegetarian",
  vegan: "Vegan",
  other: "Other",
};

/** Display label for any pre-consultation value (or a legacy one). */
export function preConsultLabel(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const trimmed = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().max(500, "Please keep this under 500 characters"),
);
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  trimmed.optional(),
);
const yesNo = z.enum(["yes", "no"], {
  errorMap: () => ({ message: "Please choose Yes or No" }),
});
const number = (min: number, max: number, unit: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ invalid_type_error: `Enter a number in ${unit}`, required_error: "Required" })
      .min(min, `Enter a value between ${min} and ${max} ${unit}`)
      .max(max, `Enter a value between ${min} and ${max} ${unit}`),
  );
const pick = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.enum(values as unknown as [string, ...string[]], { errorMap: () => ({ message }) });
const accepted = (message: string) =>
  z.boolean().refine((v) => v === true, { message });

/**
 * The form's answers (photos are uploaded separately and checked by the
 * submit route). Yes/No questions travel as "yes" | "no" strings so an
 * unanswered radio is distinguishable from "No".
 */
export const preConsultationSchema = z
  .object({
    skinType: pick(PRECONSULT_SKIN_TYPES, "Please choose your skin type"),
    skinConcerns: z
      .array(z.enum(PRECONSULT_SKIN_CONCERNS))
      .min(1, "Choose at least one concern")
      .max(MAX_SKIN_CONCERNS, `Choose up to ${MAX_SKIN_CONCERNS} concerns`),
    skinConcernOther: optionalText,
    skincareRoutine: optionalText,
    skinAllergy: yesNo,
    skinAllergyDetails: optionalText,
    dermTreatment: yesNo,
    dermTreatmentDetails: optionalText,
    activityLevel: pick(ACTIVITY_LEVELS, "Please choose your activity level"),
    fitnessGoal: pick(PRECONSULT_FITNESS_GOALS, "Please choose your main goal"),
    fitnessGoalOther: optionalText,
    heightCm: number(100, 250, "cm"),
    weightKg: number(30, 300, "kg"),
    healthCondition: yesNo,
    healthConditionDetails: optionalText,
    dietaryPreference: pick(PRECONSULT_DIETARY_PREFERENCES, "Please choose a dietary preference"),
    dietaryPreferenceOther: optionalText,
    dietaryRestrictions: optionalText,
    consentAccuracy: accepted("Please confirm your information is accurate"),
    consentProfessionalReview: accepted("Please confirm you understand how your information is used"),
  })
  .superRefine((v, ctx) => {
    const need = (when: boolean, field: keyof typeof v, message: string) => {
      if (when && !v[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };
    need(v.skinAllergy === "yes", "skinAllergyDetails", "Please mention briefly");
    need(v.dermTreatment === "yes", "dermTreatmentDetails", "Please mention the condition or treatment");
    need(v.healthCondition === "yes", "healthConditionDetails", "Please briefly describe");
    need(v.fitnessGoal === "other", "fitnessGoalOther", "Please tell us your goal");
    need(v.skinConcerns.includes("other"), "skinConcernOther", "Please tell us your concern");
    need(v.dietaryPreference === "other", "dietaryPreferenceOther", "Please tell us your preference");
  });

export type PreConsultationAnswers = z.infer<typeof preConsultationSchema>;
/** What the form holds before validation (numbers may still be strings). */
export type PreConsultationInput = z.input<typeof preConsultationSchema>;

/** Map validated answers onto Assessment columns. Details are cleared when the answer is No. */
export function preConsultationToAssessment(a: PreConsultationAnswers) {
  return {
    skinType: a.skinType,
    skinConcerns: a.skinConcerns,
    skinConcernOther: a.skinConcerns.includes("other") ? (a.skinConcernOther ?? null) : null,
    skincareRoutine: a.skincareRoutine ?? null,
    skinAllergyFlag: a.skinAllergy === "yes",
    allergies: a.skinAllergy === "yes" ? (a.skinAllergyDetails ?? null) : null,
    dermTreatmentFlag: a.dermTreatment === "yes",
    dermatologicalNotes: a.dermTreatment === "yes" ? (a.dermTreatmentDetails ?? null) : null,
    activityLevel: a.activityLevel,
    fitnessGoal: a.fitnessGoal,
    fitnessGoalOther: a.fitnessGoal === "other" ? (a.fitnessGoalOther ?? null) : null,
    heightCm: Math.round(a.heightCm),
    weightKg: a.weightKg,
    healthConditionFlag: a.healthCondition === "yes",
    healthConditions: a.healthCondition === "yes" ? (a.healthConditionDetails ?? null) : null,
    dietaryPreference: a.dietaryPreference,
    dietaryPreferenceOther:
      a.dietaryPreference === "other" ? (a.dietaryPreferenceOther ?? null) : null,
    dietaryRestrictions: a.dietaryRestrictions ?? null,
    consentAccuracy: a.consentAccuracy,
    consentProfessionalReview: a.consentProfessionalReview,
  };
}

/** Assessment row fields the form reads back when a client resumes. */
export interface PreConsultationRow {
  skinType?: string | null;
  skinConcerns?: string[];
  skinConcernOther?: string | null;
  skincareRoutine?: string | null;
  skinAllergyFlag?: boolean | null;
  allergies?: string | null;
  dermTreatmentFlag?: boolean | null;
  dermatologicalNotes?: string | null;
  activityLevel?: string | null;
  fitnessGoal?: string | null;
  fitnessGoalOther?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  healthConditionFlag?: boolean | null;
  healthConditions?: string | null;
  dietaryPreference?: string | null;
  dietaryPreferenceOther?: string | null;
  dietaryRestrictions?: string | null;
  consentAccuracy?: boolean | null;
  consentProfessionalReview?: boolean | null;
  submittedAt?: Date | string | null;
}

const flag = (v: boolean | null | undefined) => (v == null ? undefined : v ? "yes" : "no");
const inList = <T extends readonly string[]>(list: T, v: string | null | undefined) =>
  v && (list as readonly string[]).includes(v) ? v : undefined;

/**
 * Form defaults from a saved row. Only answers given on this form are
 * restored (a legacy row's old vocabulary is dropped, not mis-mapped).
 */
export function preConsultationDefaults(row: PreConsultationRow | null | undefined) {
  const fresh = Boolean(row?.submittedAt);
  return {
    skinType: inList(PRECONSULT_SKIN_TYPES, row?.skinType) ?? "",
    skinConcerns: (row?.skinConcerns ?? []).filter((c) =>
      (PRECONSULT_SKIN_CONCERNS as readonly string[]).includes(c),
    ),
    skinConcernOther: row?.skinConcernOther ?? "",
    skincareRoutine: row?.skincareRoutine ?? "",
    skinAllergy: fresh ? flag(row?.skinAllergyFlag) : undefined,
    skinAllergyDetails: fresh ? (row?.allergies ?? "") : "",
    dermTreatment: fresh ? flag(row?.dermTreatmentFlag) : undefined,
    dermTreatmentDetails: fresh ? (row?.dermatologicalNotes ?? "") : "",
    activityLevel: inList(ACTIVITY_LEVELS, row?.activityLevel) ?? "",
    fitnessGoal: inList(PRECONSULT_FITNESS_GOALS, row?.fitnessGoal) ?? "",
    fitnessGoalOther: row?.fitnessGoalOther ?? "",
    heightCm: row?.heightCm ?? "",
    weightKg: row?.weightKg ?? "",
    healthCondition: fresh ? flag(row?.healthConditionFlag) : undefined,
    healthConditionDetails: fresh ? (row?.healthConditions ?? "") : "",
    dietaryPreference: inList(PRECONSULT_DIETARY_PREFERENCES, row?.dietaryPreference) ?? "",
    dietaryPreferenceOther: row?.dietaryPreferenceOther ?? "",
    dietaryRestrictions: row?.dietaryRestrictions ?? "",
    consentAccuracy: fresh ? Boolean(row?.consentAccuracy) : false,
    consentProfessionalReview: fresh ? Boolean(row?.consentProfessionalReview) : false,
  };
}

/** `GTB_Pre_Consultation_[ClientName]_[ClientID]_[YYYY-MM-DD].pdf` */
export function preConsultationFileName(clientName: string, clientCode: string, date: Date): string {
  const name = clientName.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Client";
  return `GTB_Pre_Consultation_${name}_${clientCode}_${date.toISOString().slice(0, 10)}.pdf`;
}

// ---- Consultation plans (versioned documents) -----------------------------

/** Plan PDFs kept with full version history (spec §12). */
export const VERSIONED_PLAN_TYPES = ["skincare_plan", "fitness_plan", "nutrition_plan"] as const;
export type VersionedPlanType = (typeof VERSIONED_PLAN_TYPES)[number];

/** Consultation plan types a team member picks in "Upload Consultation Plan PDF". */
export const CONSULTATION_PLAN_TYPES = ["skincare_plan", "fitness_plan"] as const;

export const CONSULTATION_PLAN_LABELS: Record<VersionedPlanType, string> = {
  skincare_plan: "Skincare consultation plan",
  fitness_plan: "Fitness consultation plan",
  nutrition_plan: "Diet plan",
};

export function isVersionedPlanType(type: string): type is VersionedPlanType {
  return (VERSIONED_PLAN_TYPES as readonly string[]).includes(type);
}
