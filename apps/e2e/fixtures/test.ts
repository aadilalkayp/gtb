/**
 * Shared test base. `asRole("cro")` opens a fresh signed-in page for that
 * persona; `sharedClient()` loads the active client the journey project
 * created (name, id, portal credentials).
 */
import { test as base, type Browser, type Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storageStatePath, type StaffRole } from "../helpers/roles.js";

export const E2E_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURES_FILE = path.join(E2E_DIR, ".auth", "fixtures.json");

export interface SharedFixtures {
  /** Client created and activated by the journey project. */
  client: {
    name: string;
    email: string;
    phone: string;
    password: string;
    /** Path of a storageState signed in to the client portal. */
    storageState: string;
  };
}

export function saveSharedFixtures(data: SharedFixtures): void {
  fs.writeFileSync(FIXTURES_FILE, JSON.stringify(data, null, 2));
}

export function sharedClient(): SharedFixtures["client"] {
  if (!fs.existsSync(FIXTURES_FILE)) {
    throw new Error(
      "Shared fixtures missing — the journey project must run first (it creates the active client).",
    );
  }
  return (JSON.parse(fs.readFileSync(FIXTURES_FILE, "utf8")) as SharedFixtures).client;
}

export async function pageAs(browser: Browser, role: StaffRole): Promise<Page> {
  const context = await browser.newContext({
    storageState: path.join(E2E_DIR, storageStatePath(role)),
  });
  return context.newPage();
}

export async function portalPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: sharedClient().storageState });
  return context.newPage();
}

export const test = base.extend<{
  asRole: (role: StaffRole) => Promise<Page>;
}>({
  asRole: async ({ browser }, use) => {
    const pages: Page[] = [];
    await use(async (role) => {
      const page = await pageAs(browser, role);
      pages.push(page);
      return page;
    });
    for (const page of pages) {
      await page.context().close();
    }
  },
});

export { expect };
