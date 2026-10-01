import { defineConfig, devices } from "@playwright/test";
import { E2E, apiEnv, webEnv } from "./helpers/env.js";

/**
 * GTB OS E2E suite.
 *
 * Environment model:
 *  - globalSetup boots the dedicated gtb_e2e Supabase stack (ports 545xx),
 *    migrates + reseeds the database, creates one auth user per staff role,
 *    and saves a signed-in storageState per role under .auth/.
 *  - Playwright then starts the API (:3105) and web (:5185) dev servers with
 *    env pointing at the e2e stack, so `pnpm dev` and dev data are untouched.
 *
 * Project graph: auth-check → journey (builds shared fixtures through the
 * real product flows) → modules (everything else, parallel).
 */
export default defineConfig({
  testDir: "./specs",
  globalSetup: "./setup/bootstrap.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // One shared database: files run in parallel, tests within a file in order.
  fullyParallel: false,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  outputDir: "./test-results",
  reporter: process.env.CI
    ? [
        ["list"],
        ["github"],
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/junit.xml" }],
      ]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E.webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },
  projects: [
    {
      // Verifies each role's saved session works and triggers first-login
      // linking (email → authId) before anything else runs.
      name: "auth-check",
      testMatch: /auth\.check\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // The full lead → active-client story. Also persists the shared
      // fixtures (active client + client portal session) other specs reuse.
      name: "journey",
      testMatch: /journey\/.*\.spec\.ts/,
      dependencies: ["auth-check"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "modules",
      testMatch: /modules\/.*\.spec\.ts/,
      dependencies: ["journey"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @gtb/api exec next dev --port ${E2E.apiPort}`,
      url: `${E2E.apiUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: apiEnv(),
    },
    {
      command: `pnpm --filter @gtb/web exec vite --port ${E2E.webPort} --strictPort`,
      url: E2E.webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: webEnv(),
    },
  ],
});
