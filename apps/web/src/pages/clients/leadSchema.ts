import { z } from "zod";

export const leadSchema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().min(5, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  type: z.enum(["groom", "bride"]),
  weddingDate: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  leadSourceId: z.string().optional(),
  notes: z.string().optional(),
});

export type LeadFormValues = z.infer<typeof leadSchema>;

export const emptyLead: LeadFormValues = {
  name: "",
  phone: "",
  email: "",
  type: "groom",
  weddingDate: "",
  city: "",
  leadSourceId: "",
  notes: "",
};
