/**
 * The cast of personas the suite plays. One per staff role, created fresh on
 * every run (Supabase auth user + pre-provisioned User row linked by email on
 * first login, exactly like real staff onboarding).
 *
 * Client personas are NOT listed here: clients are created through the real
 * product flows (lead → invite → register) or seeded per-fixture, so their
 * emails live next to the specs that own them.
 */

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

export interface Persona {
  role: StaffRole;
  email: string;
  name: string;
}

export const PERSONAS: Record<StaffRole, Persona> = {
  founder: { role: "founder", email: "founder@e2e.gtb.test", name: "Farah Founder" },
  ops_head: { role: "ops_head", email: "ops@e2e.gtb.test", name: "Omar Ops" },
  cro: { role: "cro", email: "cro@e2e.gtb.test", name: "Carla Cro" },
  coach: { role: "coach", email: "coach@e2e.gtb.test", name: "Kiran Coach" },
  skincare_consultant: {
    role: "skincare_consultant",
    email: "skincare@e2e.gtb.test",
    name: "Sana Skincare",
  },
  fitness_trainer: {
    role: "fitness_trainer",
    email: "fitness@e2e.gtb.test",
    name: "Faris Fitness",
  },
  styling_consultant: {
    role: "styling_consultant",
    email: "styling@e2e.gtb.test",
    name: "Stella Styling",
  },
  media: { role: "media", email: "media@e2e.gtb.test", name: "Mia Media" },
};

/** Path of the saved signed-in browser state for a role. */
export function storageStatePath(role: StaffRole): string {
  return `.auth/${role}.json`;
}
