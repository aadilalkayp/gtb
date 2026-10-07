import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Resolver, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Camera, Check, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import {
  ACTIVITY_LEVELS,
  MAX_SKIN_CONCERNS,
  PRECONSULT_DIETARY_PREFERENCES,
  PRECONSULT_FITNESS_GOALS,
  PRECONSULT_SKIN_CONCERNS,
  PRECONSULT_SKIN_TYPES,
  SKIN_PHOTO_ANGLES,
  SKIN_PHOTO_ANGLE_HINTS,
  SKIN_PHOTO_ANGLE_LABELS,
  SKIN_PHOTO_REQUIREMENTS,
  preConsultLabel,
  preConsultationDefaults,
  preConsultationSchema,
  type PreConsultationAnswers,
  type PreConsultationInput,
  type SkinPhotoAngle,
} from "@gtb/shared";
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import {
  AssessmentRequestError,
  removeSkinPhoto,
  submitAssessment,
  uploadSkinPhoto,
  type AssessmentRecord,
  type SkinPhoto,
} from "@/lib/assessmentApi";
import { cn } from "@/lib/utils";

const PHOTO_ACCEPT = "image/jpeg,image/png";

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-5 p-5 sm:p-6" aria-labelledby={`pc-section-${step}`}>
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
          {step}
        </span>
        <div>
          <h2 id={`pc-section-${step}`} className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Yes / No as two pill radios; the reveal for details is the caller's. */
function YesNo({
  name,
  registration,
  value,
}: {
  name: string;
  registration: UseFormRegisterReturn;
  value: string | undefined;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex gap-2">
      {(["no", "yes"] as const).map((v) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" value={v} {...registration} className="peer sr-only" />
          <span
            className={cn(
              "inline-flex h-9 min-w-[72px] items-center justify-center rounded-lg border px-4 text-sm transition-colors duration-150",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
              value === v
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {v === "yes" ? "Yes" : "No"}
          </span>
        </label>
      ))}
    </div>
  );
}

function OptionSelect({
  id,
  values,
  placeholder,
  registration,
  invalid,
}: {
  id: string;
  values: readonly string[];
  placeholder: string;
  registration: UseFormRegisterReturn;
  invalid?: boolean;
}) {
  return (
    <Select id={id} {...registration} aria-invalid={invalid || undefined}>
      <option value="">{placeholder}</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {preConsultLabel(v)}
        </option>
      ))}
    </Select>
  );
}

function PhotoSlot({
  angle,
  photo,
  disabled,
  missing,
  onChange,
}: {
  angle: SkinPhotoAngle;
  photo: SkinPhoto | undefined;
  disabled: boolean;
  missing: boolean;
  onChange: (angle: SkinPhotoAngle, photo: SkinPhoto | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string>();
  const [local, setLocal] = useState<string>();
  const label = SKIN_PHOTO_ANGLE_LABELS[angle];

  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local);
  }, [local]);

  async function pick(file: File) {
    setError(undefined);
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Please choose a JPG or PNG photo.");
      return;
    }
    setBusy("upload");
    const objectUrl = URL.createObjectURL(file);
    setLocal(objectUrl);
    try {
      onChange(angle, await uploadSkinPhoto(angle, file));
    } catch (e) {
      setLocal(undefined);
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setError(undefined);
    setBusy("remove");
    try {
      await removeSkinPhoto(angle);
      setLocal(undefined);
      onChange(angle, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the photo.");
    } finally {
      setBusy(null);
    }
  }

  const src = local ?? photo?.previewUrl ?? undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        aria-label={`${label} photo`}
        data-angle={angle}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => input.current?.click()}
        aria-label={photo ? `Replace ${label.toLowerCase()} photo` : `Add ${label.toLowerCase()} photo`}
        className={cn(
          "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl transition-[border-color,transform] duration-150 active:scale-[0.99] disabled:cursor-default",
          src
            ? "bg-muted"
            : cn(
                "border-[1.5px] border-dashed bg-surface text-muted-foreground hover:border-primary/50",
                missing || error ? "border-danger/60" : "border-border-strong",
              ),
        )}
      >
        {src ? (
          <>
            <img src={src} alt={label} className="h-full w-full object-cover" />
            {busy === null && photo && (
              <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-success text-white shadow-sm">
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Spinner className="h-6 w-6" />
              </span>
            )}
          </>
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-2 text-center text-xs">
            <Camera className="h-6 w-6" />
            <span className="font-medium text-foreground">Add photo</span>
            <span>JPG or PNG</span>
          </span>
        )}
      </button>
      <div>
        <p className="text-sm font-medium">
          {label}
          <span className="text-danger"> *</span>
        </p>
        <p className="text-xs text-muted-foreground">{SKIN_PHOTO_ANGLE_HINTS[angle]}</p>
      </div>
      {photo && !disabled && (
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-0 flex-1 px-2"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
            aria-label={`Replace ${label.toLowerCase()}`}
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Replace</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 px-2"
            disabled={busy !== null}
            loading={busy === "remove"}
            onClick={() => void remove()}
            aria-label={`Remove ${label.toLowerCase()} photo`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && missing && !photo && (
        <p className="text-xs text-danger">This photo is required.</p>
      )}
    </div>
  );
}

/**
 * The Pre-Consultation Assessment (GTB spec, Oct 2026): skincare, three skin
 * photos, fitness, nutrition and consent. Used as the first onboarding step
 * and at /portal/assessment when the team reopens a submitted form.
 */
export function PreConsultationForm({
  assessment,
  photos: initialPhotos,
  submitLabel = "Submit Assessment",
  onSubmitted,
}: {
  assessment: AssessmentRecord | null;
  photos: SkinPhoto[];
  submitLabel?: string;
  onSubmitted: () => void | Promise<void>;
}) {
  const [photos, setPhotos] = useState<Partial<Record<SkinPhotoAngle, SkinPhoto>>>(() =>
    Object.fromEntries(initialPhotos.map((p) => [p.angle, p])),
  );
  const [photosTouched, setPhotosTouched] = useState(false);
  const [error, setError] = useState<string>();
  // A "please fix the form" message hides itself once nothing is left to fix;
  // server and network errors stay until the next attempt.
  const [errorIsValidation, setErrorIsValidation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError: setFieldError,
    formState: { errors },
  } = useForm<PreConsultationInput, unknown, PreConsultationAnswers>({
    // The schema coerces numbers, so its input and output types differ.
    resolver: zodResolver(preConsultationSchema) as unknown as Resolver<
      PreConsultationInput,
      unknown,
      PreConsultationAnswers
    >,
    defaultValues: preConsultationDefaults(assessment) as PreConsultationInput,
    shouldFocusError: true,
  });

  const v = useWatch({ control });
  const concerns = (v.skinConcerns ?? []) as string[];
  const missingPhotos = SKIN_PHOTO_ANGLES.filter((a) => !photos[a]);

  function onPhotoChange(angle: SkinPhotoAngle, photo: SkinPhoto | null) {
    setPhotos((prev) => {
      const next = { ...prev };
      if (photo) next[angle] = photo;
      else delete next[angle];
      return next;
    });
  }

  async function onValid(values: PreConsultationAnswers) {
    setError(undefined);
    setErrorIsValidation(false);
    setPhotosTouched(true);
    if (missingPhotos.length) {
      setErrorIsValidation(true);
      setError("Please upload all three skin photos before submitting.");
      document.getElementById("pc-section-2")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSubmitting(true);
    try {
      await submitAssessment(values);
      await onSubmitted();
    } catch (e) {
      if (e instanceof AssessmentRequestError) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          setFieldError(field as keyof PreConsultationInput, { message });
        }
      }
      setError(e instanceof Error ? e.message : "Could not submit your assessment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid, () => {
        setPhotosTouched(true);
        setErrorIsValidation(true);
        setError("Some answers are missing. Please check the highlighted questions.");
      })}
      className="space-y-5"
    >
      <p className="text-sm text-muted-foreground">
        This takes about 3 to 5 minutes. It helps your GTB consultant prepare before your
        consultation. Questions marked <span className="text-danger">*</span> are required.
      </p>

      {/* A. Skincare */}
      <Section step={1} title="Skincare">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Skin type" htmlFor="pc-skinType" required error={errors.skinType?.message}>
            <OptionSelect
              values={PRECONSULT_SKIN_TYPES}
              placeholder="Select your skin type"
              id="pc-skinType"
              registration={register("skinType")}
              invalid={Boolean(errors.skinType)}
            />
          </Field>
        </div>
        <Field
          label="Current skin concerns"
          required
          hint={`Choose up to ${MAX_SKIN_CONCERNS}.`}
          error={errors.skinConcerns?.message}
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="Current skin concerns">
            {PRECONSULT_SKIN_CONCERNS.map((c) => {
              const checked = concerns.includes(c);
              const full = !checked && concerns.length >= MAX_SKIN_CONCERNS;
              return (
                <label key={c} className={cn("cursor-pointer", full && "cursor-not-allowed")}>
                  <input
                    type="checkbox"
                    value={c}
                    disabled={full}
                    {...register("skinConcerns")}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "inline-block rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                      full && "opacity-45 hover:border-border hover:text-muted-foreground",
                    )}
                  >
                    {preConsultLabel(c)}
                  </span>
                </label>
              );
            })}
          </div>
        </Field>
        {concerns.includes("other") && (
          <Field label="Other concern" htmlFor="pc-skinConcernOther" required error={errors.skinConcernOther?.message}>
            <Input id="pc-skinConcernOther" {...register("skinConcernOther")} placeholder="Please describe briefly" />
          </Field>
        )}
        <Field label="Current skincare routine" htmlFor="pc-routine" hint="Optional">
          <Textarea
            id="pc-routine"
            rows={2}
            {...register("skincareRoutine")}
            placeholder="Cleanser, moisturizer, SPF, etc."
          />
        </Field>
        <div className="space-y-5">
          <div className="space-y-2">
            <Field label="Known skin allergies or product reactions?" required error={errors.skinAllergy?.message}>
              <YesNo name="Known skin allergies or product reactions" registration={register("skinAllergy")} value={v.skinAllergy} />
            </Field>
            {v.skinAllergy === "yes" && (
              <Field label="Please mention briefly" htmlFor="pc-allergy" required error={errors.skinAllergyDetails?.message}>
                <Input id="pc-allergy" {...register("skinAllergyDetails")} />
              </Field>
            )}
          </div>
          <div className="space-y-2">
            <Field label="Current dermatological treatment?" required error={errors.dermTreatment?.message}>
              <YesNo name="Current dermatological treatment" registration={register("dermTreatment")} value={v.dermTreatment} />
            </Field>
            {v.dermTreatment === "yes" && (
              <Field label="Please mention the condition or treatment" htmlFor="pc-derm" required error={errors.dermTreatmentDetails?.message}>
                <Input id="pc-derm" {...register("dermTreatmentDetails")} />
              </Field>
            )}
          </div>
        </div>
      </Section>

      {/* B. Skin photos */}
      <Section
        step={2}
        title="Skin Assessment Photos"
        description="Please upload 3 recent, clear and unedited photos of your face."
      >
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ImagePlus className="h-4 w-4 text-primary" /> Photo requirements
          </p>
          <ul className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
            {SKIN_PHOTO_REQUIREMENTS.map((r) => (
              <li key={r} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <span>Poor-quality, filtered or distant photos may affect the accuracy of the assessment.</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {SKIN_PHOTO_ANGLES.map((angle) => (
            <PhotoSlot
              key={angle}
              angle={angle}
              photo={photos[angle]}
              disabled={submitting}
              missing={photosTouched}
              onChange={onPhotoChange}
            />
          ))}
        </div>
      </Section>

      {/* C. Fitness */}
      <Section step={3} title="Fitness">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current activity level" htmlFor="pc-activity" required error={errors.activityLevel?.message}>
            <OptionSelect
              values={ACTIVITY_LEVELS}
              placeholder="Select your activity level"
              id="pc-activity"
              registration={register("activityLevel")}
              invalid={Boolean(errors.activityLevel)}
            />
          </Field>
          <Field label="Primary fitness goal" htmlFor="pc-goal" required error={errors.fitnessGoal?.message}>
            <OptionSelect
              values={PRECONSULT_FITNESS_GOALS}
              placeholder="Select your main goal"
              id="pc-goal"
              registration={register("fitnessGoal")}
              invalid={Boolean(errors.fitnessGoal)}
            />
          </Field>
          {v.fitnessGoal === "other" && (
            <Field label="Your goal" htmlFor="pc-goalOther" required error={errors.fitnessGoalOther?.message} className="sm:col-span-2">
              <Input id="pc-goalOther" {...register("fitnessGoalOther")} placeholder="Please describe briefly" />
            </Field>
          )}
          <Field label="Height (cm)" htmlFor="pc-height" required error={errors.heightCm?.message}>
            <Input id="pc-height" type="number" inputMode="numeric" {...register("heightCm")} placeholder="175" />
          </Field>
          <Field label="Weight (kg)" htmlFor="pc-weight" required error={errors.weightKg?.message}>
            <Input id="pc-weight" type="number" inputMode="decimal" step="0.1" {...register("weightKg")} placeholder="70" />
          </Field>
        </div>
        <div className="space-y-2">
          <Field
            label="Do you currently have any injury, medical condition or physical limitation that may affect exercise?"
            required
            error={errors.healthCondition?.message}
          >
            <YesNo name="Injury, medical condition or physical limitation" registration={register("healthCondition")} value={v.healthCondition} />
          </Field>
          {v.healthCondition === "yes" && (
            <Field label="Please briefly describe" htmlFor="pc-health" required error={errors.healthConditionDetails?.message}>
              <Input id="pc-health" {...register("healthConditionDetails")} />
            </Field>
          )}
        </div>
      </Section>

      {/* D. Nutrition */}
      <Section step={4} title="Nutrition">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dietary preference" htmlFor="pc-diet" required error={errors.dietaryPreference?.message}>
            <OptionSelect
              values={PRECONSULT_DIETARY_PREFERENCES}
              placeholder="Select a preference"
              id="pc-diet"
              registration={register("dietaryPreference")}
              invalid={Boolean(errors.dietaryPreference)}
            />
          </Field>
          {v.dietaryPreference === "other" && (
            <Field label="Your preference" htmlFor="pc-dietOther" required error={errors.dietaryPreferenceOther?.message}>
              <Input id="pc-dietOther" {...register("dietaryPreferenceOther")} placeholder="Please describe briefly" />
            </Field>
          )}
        </div>
        <Field label="Food allergies or dietary restrictions" htmlFor="pc-restrictions" hint="Optional">
          <Input
            id="pc-restrictions"
            {...register("dietaryRestrictions")}
            placeholder="Food allergies, intolerances or dietary restrictions."
          />
        </Field>
      </Section>

      {/* Consent */}
      <Section step={5} title="Confirmation">
        <div className="space-y-3">
          {(
            [
              ["consentAccuracy", "I confirm that the information provided is accurate to the best of my knowledge."],
              [
                "consentProfessionalReview",
                "I understand that the information and photos will be reviewed by the relevant GTB professionals as part of my personalized transformation journey.",
              ],
            ] as const
          ).map(([name, text]) => (
            <div key={name}>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  {...register(name)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[hsl(var(--primary))]"
                />
                <span>{text}</span>
              </label>
              {errors[name]?.message && (
                <p className="ml-7 mt-1 text-xs text-danger">{errors[name]?.message}</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {error && (!errorIsValidation || Object.keys(errors).length > 0 || missingPhotos.length > 0) && (
        <div role="alert" className="rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {missingPhotos.length
            ? `${3 - missingPhotos.length} of 3 skin photos added`
            : "All 3 skin photos added"}
        </p>
        <Button type="submit" size="lg" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
