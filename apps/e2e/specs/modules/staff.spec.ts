/**
 * Staff lifecycle, founder-side: invite → register → edit → deactivate →
 * blocked → reactivate → access restored.
 *
 * Operates ONLY on a user this file creates (a new Client Coach); the eight
 * seeded personas are never modified. Coaches are not consultants, so the
 * per-session rate field does not render in their Edit modal (UsersSettings
 * shows it only for ROLE_TO_SERVICE roles) — rates are intentionally skipped.
 */
import { test, expect, pageAs } from "../../fixtures/test.js";
import { field, uniq } from "../../helpers/ui.js";
import { E2E } from "../../helpers/env.js";

test.describe.configure({ mode: "serial" });

const coachName = uniq("Staff Casey");
const coachEmail = `staff.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}@e2e.gtb.test`;
const coachPassword = "staff-e2e-password";

let inviteUrl = "";

/** The new coach's row in the Team & Users list, matched by unique email. */
function userRow(page: import("@playwright/test").Page) {
  return page.locator(".card > div").filter({ hasText: coachEmail }).first();
}

async function openTeamAndUsers(page: import("@playwright/test").Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Team & Users" }).click();
  await expect(page.getByRole("heading", { name: "Team & Users" })).toBeVisible();
}

async function signInAsCoach(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(coachEmail);
  await page.getByLabel("Password").fill(coachPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("founder invites a new Client Coach and gets a shareable link", async ({ browser }) => {
  const page = await pageAs(browser, "founder");
  await openTeamAndUsers(page);

  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite staff member" });
  await expect(dialog).toBeVisible();

  await field(dialog, "Full name").fill(coachName);
  await field(dialog, "Email").fill(coachEmail);
  await field(dialog, "Phone").fill("+91 90000 00042");
  await field(dialog, "Role").selectOption({ label: "Client Coach" });
  await dialog.getByRole("button", { name: "Send invite" }).click();

  // Email is unconfigured in e2e, so the result view ("Account created")
  // renders the registration link in a <code> element inside the same modal.
  // (The separate "Invite link for {name}" modal only appears on re-sends.)
  await expect(dialog.getByText("Account created")).toBeVisible();
  const link = await dialog.locator("code").textContent();
  expect(link).toBeTruthy();
  inviteUrl = link!.trim();
  expect(inviteUrl).toContain("http");
  await dialog.getByRole("button", { name: "Done" }).click();

  // The list shows the pending invite.
  await expect(userRow(page)).toContainText("Invite pending");
  await page.context().close();
});

test("invited coach sets a password and lands on the staff dashboard", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // The invite link verifies with GoTrue and lands on the set-password screen;
  // RegisterPage sends staff (non-clients) to /dashboard afterwards.
  await page.goto(inviteUrl);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await page.getByLabel("New password").fill(coachPassword);
  await page.getByLabel("Confirm password").fill(coachPassword);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await context.close();
});

test("founder edits the new coach's details", async ({ browser }) => {
  const page = await pageAs(browser, "founder");
  await openTeamAndUsers(page);

  await userRow(page).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: `Edit ${coachName}` });
  await expect(dialog).toBeVisible();
  // Client Coach is not a consultant role, so no per-session rate field
  // renders here — only name/phone/role. Update the phone.
  await field(dialog, "Phone").fill("+91 90000 00043");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(userRow(page)).toContainText("+91 90000 00043");
  await page.context().close();
});

test("deactivated coach is blocked from the app", async ({ browser }) => {
  const founder = await pageAs(browser, "founder");
  await openTeamAndUsers(founder);
  await userRow(founder).getByRole("button", { name: "Deactivate" }).click();
  await expect(userRow(founder)).toContainText("Deactivated");

  // Supabase still authenticates them, but resolveAuthUser rejects inactive
  // users, so no profile loads and the guard shows the unprovisioned notice.
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAsCoach(page);
  await expect(page.getByRole("heading", { name: "Account not set up" })).toBeVisible();
  await context.close();
  await founder.context().close();
});

test("reactivated coach can access the dashboard again", async ({ browser }) => {
  const founder = await pageAs(browser, "founder");
  await openTeamAndUsers(founder);
  await userRow(founder).getByRole("button", { name: "Reactivate" }).click();
  await expect(userRow(founder)).not.toContainText("Deactivated");
  await founder.context().close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAsCoach(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account not set up" })).not.toBeVisible();
  await context.close();
});
