/**
 * Domain enums for GTB OS.
 *
 * These are the single source of truth for status values, roles, and types used
 * across the database schema, backend, and frontend. Keep them in sync with the
 * ZenStack schema (`packages/db/schema.zmodel`).
 */

/** Staff roles. `client` is modelled separately (see the Client entity), not a staff role. */
export const STAFF_ROLES = [
  "founder",
  "ops_head",
  "cro",
  "coach",
  "skincare_consultant",
  "fitness_trainer",
  "styling_consultant",
  "media",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  founder: "Founder",
  ops_head: "Operations Head",
  cro: "CRO",
  coach: "Client Coach",
  skincare_consultant: "Skincare Consultant",
  fitness_trainer: "Fitness Trainer",
  styling_consultant: "Styling Consultant",
  media: "Media Team",
};

/** Roles that are consultants (deliver sessions). */
export const CONSULTANT_ROLES = [
  "skincare_consultant",
  "fitness_trainer",
  "styling_consultant",
] as const;
export type ConsultantRole = (typeof CONSULTANT_ROLES)[number];

export const CLIENT_TYPES = ["groom", "bride"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  groom: "Groom To Be",
  bride: "Glow To Be",
};

/** Short brand prefix used in human-friendly client codes (e.g. "GTB1256"). */
export const CLIENT_CODE_PREFIX: Record<ClientType, string> = {
  groom: "GTB",
  bride: "GLW",
};

export const CLIENT_STATUSES = [
  "lead",
  "converted",
  "active",
  "completed",
  "on_hold",
  "cancelled",
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Lead",
  converted: "Converted",
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

/** Informational sub-status while a client is still a Lead. */
export const LEAD_PHASES = [
  "new",
  "contacted",
  "invited",
  "registered",
  "plan_selected",
  "payment_submitted",
] as const;
export type LeadPhase = (typeof LEAD_PHASES)[number];

export const LEAD_PHASE_LABELS: Record<LeadPhase, string> = {
  new: "New",
  contacted: "Contacted",
  invited: "Invited",
  registered: "Registered",
  plan_selected: "Plan Selected",
  payment_submitted: "Payment Submitted",
};

/** Ordering of lead phases, used to decide whether a phase change is forward progress. */
export const LEAD_PHASE_ORDER: Record<LeadPhase, number> = {
  new: 0,
  contacted: 1,
  invited: 2,
  registered: 3,
  plan_selected: 4,
  payment_submitted: 5,
};

export const SERVICE_TYPES = ["skincare", "fitness", "styling"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  skincare: "Skincare",
  fitness: "Fitness",
  styling: "Styling",
};

/** Maps a service type to the consultant role that delivers it. */
export const SERVICE_TO_CONSULTANT_ROLE: Record<ServiceType, ConsultantRole> = {
  skincare: "skincare_consultant",
  fitness: "fitness_trainer",
  styling: "styling_consultant",
};

export const SESSION_STATUSES = [
  "scheduled",
  "completed",
  "delayed",
  "missed",
  "cancelled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const INSTALLMENT_STATUSES = [
  "pending",
  "proof_submitted",
  "approved",
  "rejected",
  "overdue",
  "waived",
] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["upi", "bank_transfer", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  other: "Other",
};

/** Roles a staff member can be assigned to a client as. */
export const ASSIGNMENT_ROLES = [
  "cro",
  "coach",
  "skincare_consultant",
  "fitness_trainer",
  "styling_consultant",
] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const STYLING_STATUSES = ["upcoming", "in_progress", "completed"] as const;
export type StylingStatus = (typeof STYLING_STATUSES)[number];

export const FOLLOWUP_TYPES = [
  "weekly_checkin",
  "payment_reminder",
  "progress_update",
  "satisfaction_check",
] as const;
export type FollowUpType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = {
  weekly_checkin: "Weekly Check-in",
  payment_reminder: "Payment Reminder",
  progress_update: "Progress Update",
  satisfaction_check: "Satisfaction Check",
};

/** Default cadence (days) used to auto-generate the next follow-up of each type. */
export const FOLLOWUP_DEFAULT_FREQUENCY_DAYS: Record<FollowUpType, number> = {
  weekly_checkin: 7,
  payment_reminder: 0, // anchored to payment due dates, not a fixed cadence
  progress_update: 14,
  satisfaction_check: 0, // triggered every Nth session
};

export const FOLLOWUP_STATUSES = ["pending", "completed", "overdue"] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

export const EXPENSE_STATUSES = ["submitted", "approved", "rejected"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const DOCUMENT_TYPES = [
  "assessment_form",
  "skincare_plan",
  "fitness_plan",
  "styling_guide",
  "consultation_notes",
  "payment_proof",
  "payment_receipt",
  "expense_receipt",
  "client_photo",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CONTENT_STAGES = ["planned", "shooting", "editing", "review", "posted"] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];

export const CONTENT_TYPES = ["photo", "video", "reel", "carousel", "story", "blog"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_PLATFORMS = ["instagram", "youtube", "facebook", "website", "other"] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const CAMPAIGNS = ["gtb", "glow_to_be", "general"] as const;
export type Campaign = (typeof CAMPAIGNS)[number];

export const ACTIVITY_ACTIONS = ["created", "updated", "deleted", "status_changed"] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// ---- Onboarding assessment vocabularies -----------------------------------

export const SKIN_TYPES = ["oily", "dry", "combination", "sensitive", "normal"] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

export const SKIN_CONCERNS = [
  "acne",
  "pigmentation",
  "dark_circles",
  "uneven_tone",
  "dullness",
  "other",
] as const;
export type SkinConcern = (typeof SKIN_CONCERNS)[number];

export const FITNESS_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export const DIETARY_PREFERENCES = ["vegetarian", "vegan", "non_veg", "other"] as const;
export type DietaryPreference = (typeof DIETARY_PREFERENCES)[number];

export const FITNESS_GOALS = [
  "weight_loss",
  "muscle_gain",
  "toning",
  "general_fitness",
  "other",
] as const;
export type FitnessGoal = (typeof FITNESS_GOALS)[number];

export const STYLE_PREFERENCES = ["classic", "modern", "traditional", "experimental"] as const;
export type StylePreference = (typeof STYLE_PREFERENCES)[number];

export const SKIN_TYPE_LABELS: Record<SkinType, string> = {
  oily: "Oily",
  dry: "Dry",
  combination: "Combination",
  sensitive: "Sensitive",
  normal: "Normal",
};

export const SKIN_CONCERN_LABELS: Record<SkinConcern, string> = {
  acne: "Acne",
  pigmentation: "Pigmentation",
  dark_circles: "Dark circles",
  uneven_tone: "Uneven tone",
  dullness: "Dullness",
  other: "Other",
};

export const FITNESS_LEVEL_LABELS: Record<FitnessLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const DIETARY_PREFERENCE_LABELS: Record<DietaryPreference, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  non_veg: "Non-vegetarian",
  other: "Other",
};

export const FITNESS_GOAL_LABELS: Record<FitnessGoal, string> = {
  weight_loss: "Weight loss",
  muscle_gain: "Muscle gain",
  toning: "Toning",
  general_fitness: "General fitness",
  other: "Other",
};

export const STYLE_PREFERENCE_LABELS: Record<StylePreference, string> = {
  classic: "Classic",
  modern: "Modern",
  traditional: "Traditional",
  experimental: "Experimental",
};

/** Self-described body-type starting points (free text is also allowed in the form). */
export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

/** Default gender implied by the client type (editable in the assessment). */
export const CLIENT_TYPE_DEFAULT_GENDER: Record<ClientType, Gender> = {
  groom: "male",
  bride: "female",
};

/** Wedding-outfit budget brackets (INR), shown as a dropdown in styling. */
export const OUTFIT_BUDGET_RANGES = [
  "under_25k",
  "25k_50k",
  "50k_1l",
  "1l_2l",
  "above_2l",
] as const;
export type OutfitBudgetRange = (typeof OUTFIT_BUDGET_RANGES)[number];

export const OUTFIT_BUDGET_RANGE_LABELS: Record<OutfitBudgetRange, string> = {
  under_25k: "Under ₹25,000",
  "25k_50k": "₹25,000 – ₹50,000",
  "50k_1l": "₹50,000 – ₹1,00,000",
  "1l_2l": "₹1,00,000 – ₹2,00,000",
  above_2l: "Above ₹2,00,000",
};
