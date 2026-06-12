import { useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUpsertAssessment, useUpdateClient } from "@gtb/db/hooks";
import {
  GENDERS,
  GENDER_LABELS,
  SKIN_TYPES,
  SKIN_TYPE_LABELS,
  SKIN_CONCERNS,
  SKIN_CONCERN_LABELS,
  FITNESS_LEVELS,
  FITNESS_LEVEL_LABELS,
  DIETARY_PREFERENCES,
  DIETARY_PREFERENCE_LABELS,
  FITNESS_GOALS,
  FITNESS_GOAL_LABELS,
  STYLE_PREFERENCES,
  STYLE_PREFERENCE_LABELS,
  OUTFIT_BUDGET_RANGES,
  OUTFIT_BUDGET_RANGE_LABELS,
  CLIENT_TYPE_DEFAULT_GENDER,
  LEAD_PHASE_ORDER,
  type LeadPhase,
} from "@gtb/shared";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FileUploadField } from "@/components/FileUploadField";
import {
  assessmentSchema,
  assessmentDefaults,
  type AssessmentFormValues,
  type ExistingAssessment,
} from "./assessmentSchema";

type MultiName = "skinConcerns" | "fitnessGoals" | "stylePreferences";

function PillCheckboxes({
  name,
  options,
  register,
}: {
  name: MultiName;
  options: readonly { value: string; label: string }[];
  register: UseFormRegister<AssessmentFormValues>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input type="checkbox" value={o.value} {...register(name)} className="peer sr-only" />
          <span className="inline-block rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function options(values: readonly string[], labels: Record<string, string>) {
  return values.map((v) => ({ value: v, label: labels[v] ?? v }));
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-foreground">{children}</h3>;
}

export function AssessmentStep({
  client,
  assessment,
  onDone,
}: {
  client: { id: string; type: "groom" | "bride"; leadPhase: string };
  assessment: (ExistingAssessment & { profilePhotoUrl?: string | null }) | null;
  onDone: () => void | Promise<void>;
}) {
  const upsert = useUpsertAssessment();
  const updateClient = useUpdateClient();
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(
    assessment?.profilePhotoUrl ?? undefined,
  );
  const [error, setError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AssessmentFormValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: assessmentDefaults(assessment, CLIENT_TYPE_DEFAULT_GENDER[client.type]),
  });

  async function onSubmit(values: AssessmentFormValues) {
    setError(undefined);
    const blank = (s?: string) => (s && s.trim() ? s.trim() : undefined);
    const data = {
      age: values.age,
      gender: values.gender,
      profilePhotoUrl: photoUrl,
      skinType: values.skinType,
      skinConcerns: values.skinConcerns,
      skincareRoutine: blank(values.skincareRoutine),
      allergies: blank(values.allergies),
      dermatologicalNotes: blank(values.dermatologicalNotes),
      fitnessLevel: values.fitnessLevel,
      heightCm: values.heightCm,
      weightKg: values.weightKg,
      healthConditions: blank(values.healthConditions),
      dietaryPreference: values.dietaryPreference,
      fitnessGoals: values.fitnessGoals,
      bodyType: blank(values.bodyType),
      stylePreferences: values.stylePreferences,
      outfitBudgetRange: values.outfitBudgetRange,
      colorPreferences: blank(values.colorPreferences),
      stylingNotes: blank(values.stylingNotes),
    };
    try {
      await upsert.mutateAsync({
        where: { clientId: client.id },
        create: { clientId: client.id, completedAt: new Date(), ...data },
        update: { completedAt: new Date(), ...data },
      });
      if (LEAD_PHASE_ORDER[client.leadPhase as LeadPhase] < LEAD_PHASE_ORDER.registered) {
        await updateClient.mutateAsync({
          where: { id: client.id },
          data: { leadPhase: "registered" },
        });
      }
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your assessment");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* General */}
      <section>
        <SectionTitle>About you</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Gender" required>
            <Select {...register("gender")}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Age" error={errors.age?.message}>
            <Input type="number" min={1} {...register("age")} placeholder="28" />
          </Field>
          <div className="col-span-2">
            <Field label="Profile photo" hint="Optional — helps your team recognise you.">
              <FileUploadField
                clientId={client.id}
                type="client_photo"
                accept="image/*"
                label="Add a profile photo"
                onUploaded={(doc) => setPhotoUrl(doc?.fileUrl)}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Skincare */}
      <section>
        <SectionTitle>Skincare</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Skin type" required>
              <Select {...register("skinType")}>
                {SKIN_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {SKIN_TYPE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Current concerns">
            <PillCheckboxes
              name="skinConcerns"
              options={options(SKIN_CONCERNS, SKIN_CONCERN_LABELS)}
              register={register}
            />
          </Field>
          <Field label="Current skincare routine">
            <Textarea
              {...register("skincareRoutine")}
              rows={2}
              placeholder="Cleanser, moisturiser, SPF…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Known allergies">
              <Input {...register("allergies")} placeholder="None / fragrance / …" />
            </Field>
            <Field label="Dermatological conditions or treatments">
              <Input {...register("dermatologicalNotes")} placeholder="None / ongoing…" />
            </Field>
          </div>
        </div>
      </section>

      {/* Fitness */}
      <section>
        <SectionTitle>Fitness</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current fitness level" required>
              <Select {...register("fitnessLevel")}>
                {FITNESS_LEVELS.map((f) => (
                  <option key={f} value={f}>
                    {FITNESS_LEVEL_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dietary preference">
              <Select {...register("dietaryPreference")}>
                <option value="">—</option>
                {DIETARY_PREFERENCES.map((d) => (
                  <option key={d} value={d}>
                    {DIETARY_PREFERENCE_LABELS[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Height (cm)" error={errors.heightCm?.message}>
              <Input type="number" min={1} {...register("heightCm")} placeholder="175" />
            </Field>
            <Field label="Weight (kg)" error={errors.weightKg?.message}>
              <Input type="number" min={1} {...register("weightKg")} placeholder="70" />
            </Field>
          </div>
          <Field label="Fitness goals">
            <PillCheckboxes
              name="fitnessGoals"
              options={options(FITNESS_GOALS, FITNESS_GOAL_LABELS)}
              register={register}
            />
          </Field>
          <Field label="Health conditions or injuries">
            <Input {...register("healthConditions")} placeholder="None / knee injury / …" />
          </Field>
        </div>
      </section>

      {/* Styling */}
      <section>
        <SectionTitle>Styling</SectionTitle>
        <div className="space-y-4">
          <Field label="Style preferences">
            <PillCheckboxes
              name="stylePreferences"
              options={options(STYLE_PREFERENCES, STYLE_PREFERENCE_LABELS)}
              register={register}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Outfit budget range">
              <Select {...register("outfitBudgetRange")}>
                <option value="">—</option>
                {OUTFIT_BUDGET_RANGES.map((b) => (
                  <option key={b} value={b}>
                    {OUTFIT_BUDGET_RANGE_LABELS[b]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Body type" hint="Self-described or measurements">
              <Input {...register("bodyType")} placeholder="Athletic, 40R…" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Colour preferences">
              <Input {...register("colorPreferences")} placeholder="Earth tones, navy…" />
            </Field>
            <Field label="Any specific requirements">
              <Input {...register("stylingNotes")} placeholder="Cultural, religious, comfort…" />
            </Field>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={upsert.isPending || updateClient.isPending}>
          Save & continue
        </Button>
      </div>
    </form>
  );
}
