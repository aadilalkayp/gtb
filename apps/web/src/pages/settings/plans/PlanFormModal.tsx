import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, CLIENT_TYPES, CLIENT_TYPE_LABELS } from "@gtb/shared";
import { Button, Field, Input, Select, Textarea, Modal } from "@/components/ui";
import { planFormSchema, type PlanFormValues } from "./planSchema";

export function PlanFormModal({
  open,
  onClose,
  title,
  initialValues,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initialValues: PlanFormValues;
  onSubmit: (values: PlanFormValues) => void;
  submitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "services" });
  const services = watch("services");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="plan-form" loading={submitting}>
            Save plan
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Plan name" error={errors.name?.message} required>
              <Input {...register("name")} placeholder="GTB 3 Month Premium" />
            </Field>
          </div>
          <Field label="Client type" required>
            <Select {...register("clientType")}>
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration (months)" required>
            <Input type="number" min={1} {...register("durationMonths")} />
          </Field>
          <Field label="Price (₹)" error={errors.price?.message} required>
            <Input type="number" min={0} {...register("price")} />
          </Field>
          <Field label="Installments" hint="1 = full payment upfront" required>
            <Input type="number" min={1} {...register("installmentCount")} />
          </Field>
          <div className="col-span-2">
            <Field label="Description">
              <Textarea {...register("description")} rows={2} />
            </Field>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("isActive")}
              className="h-4 w-4 rounded border-border"
            />
            Active (visible to new clients at onboarding)
          </label>
        </div>

        {/* Services */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Included services</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                append({
                  serviceType: "fitness",
                  totalSessions: 8,
                  startOffsetDays: 60,
                  manual: false,
                  frequencyDays: 7,
                })
              }
            >
              <Plus className="h-4 w-4" /> Add service
            </Button>
          </div>
          {errors.services?.root && (
            <p className="mb-2 text-xs text-danger">{errors.services.root.message}</p>
          )}

          <div className="space-y-3">
            {fields.map((field, i) => {
              const manual = services?.[i]?.manual;
              return (
                <div key={field.id} className="rounded-lg border border-border p-3">
                  <div className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-3">
                      <Field label="Service">
                        <Select {...register(`services.${i}.serviceType`)}>
                          {SERVICE_TYPES.map((s) => (
                            <option key={s} value={s}>
                              {SERVICE_TYPE_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Sessions">
                        <Input type="number" min={1} {...register(`services.${i}.totalSessions`)} />
                      </Field>
                    </div>
                    <div className="col-span-3">
                      <Field label="Starts (days before)">
                        <Input
                          type="number"
                          min={0}
                          {...register(`services.${i}.startOffsetDays`)}
                        />
                      </Field>
                    </div>
                    <div className="col-span-3">
                      <Field
                        label="Every (days)"
                        error={errors.services?.[i]?.frequencyDays?.message}
                      >
                        <Input
                          type="number"
                          min={1}
                          disabled={manual}
                          placeholder={manual ? "Manual" : ""}
                          {...register(`services.${i}.frequencyDays`)}
                        />
                      </Field>
                    </div>
                    <div className="col-span-1 pb-2">
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
                        aria-label="Remove service"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      {...register(`services.${i}.manual`)}
                      className="h-3.5 w-3.5"
                    />
                    Manual scheduling (only the first session is auto-created, e.g. styling)
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
