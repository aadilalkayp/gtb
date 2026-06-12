import { z } from "zod";

/** Empty string / null → undefined, then coerce to a number. For optional numeric inputs. */
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().positive().optional(),
);

export const assessmentSchema = z.object({
  // General
  age: optionalNumber,
  gender: z.enum(["male", "female", "other"]),
  // Skincare
  skinType: z.enum(["oily", "dry", "combination", "sensitive", "normal"]),
  skinConcerns: z.array(z.string()).default([]),
  skincareRoutine: z.string().optional(),
  allergies: z.string().optional(),
  dermatologicalNotes: z.string().optional(),
  // Fitness
  fitnessLevel: z.enum(["beginner", "intermediate", "advanced"]),
  heightCm: optionalNumber,
  weightKg: optionalNumber,
  healthConditions: z.string().optional(),
  dietaryPreference: z.enum(["vegetarian", "vegan", "non_veg", "other"]).optional(),
  fitnessGoals: z.array(z.string()).default([]),
  // Styling
  bodyType: z.string().optional(),
  stylePreferences: z.array(z.string()).default([]),
  outfitBudgetRange: z.enum(["under_25k", "25k_50k", "50k_1l", "1l_2l", "above_2l"]).optional(),
  colorPreferences: z.string().optional(),
  stylingNotes: z.string().optional(),
});

export type AssessmentFormValues = z.infer<typeof assessmentSchema>;

/** Shape of an existing Assessment row used to pre-fill the form when resuming. */
export interface ExistingAssessment {
  age?: number | null;
  gender?: string | null;
  skinType?: string | null;
  skinConcerns?: string[];
  skincareRoutine?: string | null;
  allergies?: string | null;
  dermatologicalNotes?: string | null;
  fitnessLevel?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  healthConditions?: string | null;
  dietaryPreference?: string | null;
  fitnessGoals?: string[];
  bodyType?: string | null;
  stylePreferences?: string[];
  outfitBudgetRange?: string | null;
  colorPreferences?: string | null;
  stylingNotes?: string | null;
}

/** Build RHF default values from an existing assessment (or sensible empties). */
export function assessmentDefaults(
  existing: ExistingAssessment | null | undefined,
  defaultGender: "male" | "female" | "other",
): AssessmentFormValues {
  return {
    age: existing?.age ?? undefined,
    gender: (existing?.gender as AssessmentFormValues["gender"]) ?? defaultGender,
    skinType: (existing?.skinType as AssessmentFormValues["skinType"]) ?? "normal",
    skinConcerns: existing?.skinConcerns ?? [],
    skincareRoutine: existing?.skincareRoutine ?? "",
    allergies: existing?.allergies ?? "",
    dermatologicalNotes: existing?.dermatologicalNotes ?? "",
    fitnessLevel: (existing?.fitnessLevel as AssessmentFormValues["fitnessLevel"]) ?? "beginner",
    heightCm: existing?.heightCm ?? undefined,
    weightKg: existing?.weightKg ?? undefined,
    healthConditions: existing?.healthConditions ?? "",
    dietaryPreference:
      (existing?.dietaryPreference as AssessmentFormValues["dietaryPreference"]) ?? undefined,
    fitnessGoals: existing?.fitnessGoals ?? [],
    bodyType: existing?.bodyType ?? "",
    stylePreferences: existing?.stylePreferences ?? [],
    outfitBudgetRange:
      (existing?.outfitBudgetRange as AssessmentFormValues["outfitBudgetRange"]) ?? undefined,
    colorPreferences: existing?.colorPreferences ?? "",
    stylingNotes: existing?.stylingNotes ?? "",
  };
}
