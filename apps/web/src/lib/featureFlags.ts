import { useEffect, useState } from "react";
import { env } from "./env";

/**
 * Feature flags served by the API (/api/flags — the single source of truth,
 * set via FEATURE_* env vars on the server). The UI defaults every flag to
 * OFF until the fetch confirms it, so a disabled feature never flashes on.
 */
export interface FeatureFlags {
  coach: boolean;
}

const DEFAULTS: FeatureFlags = { coach: false };

let cached: FeatureFlags | null = null;
let pending: Promise<FeatureFlags> | null = null;

export function fetchFeatureFlags(): Promise<FeatureFlags> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch(`${env.apiUrl}/api/flags`)
    .then(async (res) => {
      if (!res.ok) return DEFAULTS;
      const json = (await res.json()) as { flags?: Partial<FeatureFlags> };
      cached = { ...DEFAULTS, ...json.flags };
      return cached;
    })
    .catch(() => DEFAULTS);
  return pending;
}

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(cached ?? DEFAULTS);
  useEffect(() => {
    let alive = true;
    void fetchFeatureFlags().then((f) => {
      if (alive) setFlags(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  return flags;
}
