/**
 * Feature flags: env-driven kill switches for user-facing features.
 *
 * Read once at boot from FEATURE_* vars ("false"/"0"/"off"/"no" disable,
 * anything else enables, unset falls back to the default here). Flipping one
 * is a deploy-env change plus restart — no code change, no migration.
 *
 * The public /api/flags route serves these to the web app, so the UI and the
 * API always agree on what is on.
 */
function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return !["false", "0", "off", "no"].includes(value.trim().toLowerCase());
}

export const featureFlags = {
  /** The AI coach chat (lead hub + portal). Default OFF until GTB launches it;
   *  set FEATURE_COACH=true to enable. */
  coach: boolEnv("FEATURE_COACH", false),
} as const;

export type FeatureFlags = typeof featureFlags;
