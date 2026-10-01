/**
 * Playwright globalSetup: a clean, fully provisioned environment every run.
 *
 *  1. Start (or reuse) the dedicated gtb_e2e Supabase stack.
 *  2. prisma migrate deploy → truncate everything → reseed.
 *  3. Create the private storage buckets the API expects.
 *  4. Create one confirmed auth user per staff persona, pre-provision their
 *     User rows (the founder comes from the seed), and set consultant rates.
 *  5. Sign each persona in against GoTrue and save a Playwright storageState
 *     (Supabase session injected into localStorage) under .auth/<role>.json.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { E2E } from "../helpers/env.js";
import { startStack, E2E_DIR } from "../helpers/stack.js";
import { resetDatabase, e2ePool } from "../helpers/db.js";
import { createAuthUser, ensureBuckets } from "../helpers/supabaseAdmin.js";
import { PERSONAS, STAFF_ROLES, storageStatePath } from "../helpers/roles.js";

const REPO_ROOT = path.dirname(path.dirname(E2E_DIR));

function runDbScript(script: string, extraEnv: Record<string, string> = {}): void {
  execFileSync("pnpm", ["--filter", "@gtb/db", script], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: E2E.databaseUrl,
      DIRECT_URL: E2E.databaseUrl,
      ...extraEnv,
    },
  });
}

async function provisionStaff(): Promise<void> {
  const pool = e2ePool();
  try {
    for (const role of STAFF_ROLES) {
      const persona = PERSONAS[role];
      // The founder row comes from the seed; everyone else is pre-provisioned
      // the way real staff onboarding does it (row with authId null, linked by
      // email on first login).
      if (role !== "founder") {
        await pool.query(
          `insert into "User" (id, email, name, role, "isActive", "createdAt", "updatedAt")
           values (gen_random_uuid(), $1, $2, $3::"Role", true, now(), now())
           on conflict (email) do nothing`,
          [persona.email, persona.name, persona.role],
        );
      }
      await createAuthUser(persona.email);
    }
    // Per-session payout rates so completing a session creates a payout expense.
    for (const [role, serviceType] of [
      ["skincare_consultant", "skincare"],
      ["fitness_trainer", "fitness"],
      ["styling_consultant", "styling"],
    ] as const) {
      await pool.query(
        `insert into "ConsultantRate" (id, "userId", "serviceType", amount, "createdAt")
         select gen_random_uuid(), u.id, $1::"ServiceType", 500, now()
         from "User" u where u.email = $2
         on conflict ("userId", "serviceType") do nothing`,
        [serviceType, PERSONAS[role].email],
      );
    }
  } finally {
    await pool.end();
  }
}

/** Compose a Playwright storageState carrying a signed-in Supabase session. */
export async function buildStorageState(email: string, password = E2E.password): Promise<object> {
  const supabase = createClient(E2E.supabaseUrl, E2E.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  }
  // supabase-js persists the raw Session object under
  // sb-<first-hostname-label>-auth-token; for http://127.0.0.1:54521 → sb-127.
  const storageKey = `sb-${new URL(E2E.supabaseUrl).hostname.split(".")[0]}-auth-token`;
  return {
    cookies: [],
    origins: [
      {
        origin: E2E.webUrl,
        localStorage: [{ name: storageKey, value: JSON.stringify(data.session) }],
      },
    ],
  };
}

export default async function globalSetup(): Promise<void> {
  startStack();

  console.log("[e2e] migrate deploy…");
  runDbScript("migrate:deploy");

  console.log("[e2e] reset + seed…");
  await resetDatabase();
  runDbScript("seed", {
    SEED_FOUNDER_EMAIL: PERSONAS.founder.email,
    SEED_FOUNDER_NAME: PERSONAS.founder.name,
  });

  console.log("[e2e] buckets + staff personas…");
  await ensureBuckets();
  await provisionStaff();

  console.log("[e2e] saving signed-in storage states…");
  const authDir = path.join(E2E_DIR, ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  for (const role of STAFF_ROLES) {
    const state = await buildStorageState(PERSONAS[role].email);
    fs.writeFileSync(path.join(E2E_DIR, storageStatePath(role)), JSON.stringify(state, null, 2));
  }
  console.log("[e2e] environment ready");
}
