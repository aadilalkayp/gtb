/**
 * Capability-based permission matrix (SRS §3.2).
 *
 * The frontend uses `can()` to show/hide UI and guard routes. The backend
 * enforces the real boundary via ZenStack access policies — this module is the
 * human-readable companion to those policies and must be kept consistent.
 */
import type { StaffRole } from "./enums.js";

export const CAPABILITIES = [
  "client.view_all",
  "client.view_assigned",
  "client.create",
  "client.invite",
  "client.assign_consultants",
  "client.change_status",
  "payment.view_all",
  "payment.view_assigned",
  "payment.approve",
  "payment.record_manual",
  "session.mark_complete",
  "session.upload_docs",
  "followup.conduct",
  "plan.manage",
  "user.manage",
  "report.view_all",
  "report.view_own",
  "expense.submit",
  "expense.approve",
  "expense.view_reports",
  "media.manage",
  "leadsource.manage",
  "settings.manage",
  "calendar.view_all",
  "task.assign",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Capabilities granted to each staff role. Clients are handled separately. */
export const ROLE_CAPABILITIES: Record<StaffRole, Capability[]> = {
  founder: [...CAPABILITIES],
  ops_head: [
    "client.view_all",
    "client.create",
    "client.invite",
    "client.assign_consultants",
    "client.change_status",
    "payment.view_all",
    "payment.approve",
    "payment.record_manual",
    "followup.conduct",
    "report.view_all",
    "expense.submit",
    "expense.approve",
    "expense.view_reports",
    "leadsource.manage",
    "calendar.view_all",
    "task.assign",
  ],
  cro: [
    "client.view_assigned",
    "client.create",
    "client.invite",
    "client.change_status",
    "payment.view_assigned",
    "payment.approve",
    "payment.record_manual",
    "followup.conduct",
    "report.view_own",
    "expense.submit",
    "task.assign",
  ],
  coach: [
    "client.view_assigned",
    "followup.conduct",
    "report.view_own",
    "expense.submit",
    "task.assign",
  ],
  skincare_consultant: [
    "client.view_assigned",
    "session.mark_complete",
    "session.upload_docs",
    "report.view_own",
    "expense.submit",
  ],
  fitness_trainer: [
    "client.view_assigned",
    "session.mark_complete",
    "session.upload_docs",
    "report.view_own",
    "expense.submit",
  ],
  styling_consultant: [
    "client.view_assigned",
    "session.mark_complete",
    "session.upload_docs",
    "report.view_own",
    "expense.submit",
  ],
  media: ["media.manage", "expense.submit"],
};

export function can(role: StaffRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function canAny(role: StaffRole | null | undefined, caps: Capability[]): boolean {
  return caps.some((c) => can(role, c));
}
