import { z } from "zod";

/** One service row in the plan editor. `manual` is a UI helper → frequencyDays null. */
export const planServiceSchema = z
  .object({
    serviceType: z.enum(["skincare", "fitness", "styling"]),
    totalSessions: z.coerce.number().int().positive("≥ 1"),
    startOffsetDays: z.coerce.number().int().nonnegative(),
    manual: z.boolean(),
    frequencyDays: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((s) => s.manual || (s.frequencyDays != null && s.frequencyDays > 0), {
    message: "Set a frequency (days) or mark as manual",
    path: ["frequencyDays"],
  });

export const planFormSchema = z.object({
  name: z.string().min(1, "Required"),
  clientType: z.enum(["groom", "bride"]),
  durationMonths: z.coerce.number().int().positive(),
  price: z.coerce.number().int().nonnegative(),
  installmentCount: z.coerce.number().int().positive(),
  description: z.string().optional(),
  isActive: z.boolean(),
  services: z.array(planServiceSchema).min(1, "Add at least one service"),
});

export type PlanFormValues = z.infer<typeof planFormSchema>;

export const emptyPlan: PlanFormValues = {
  name: "",
  clientType: "groom",
  durationMonths: 3,
  price: 0,
  installmentCount: 1,
  description: "",
  isActive: true,
  services: [
    {
      serviceType: "skincare",
      totalSessions: 6,
      startOffsetDays: 90,
      manual: false,
      frequencyDays: 14,
    },
  ],
};
