/**
 * The spine of the suite: one client's full journey across every role lane.
 *
 *   CRO creates a lead → sends the invite → the client registers, completes
 *   the onboarding assessment, picks a plan, steps back through the wizard to
 *   review, submits a payment proof → the CRO approves it (lead → converted)
 *   and records the negotiated price → the Ops Head assigns the team and
 *   activates (sessions scheduled) → consultant and client both see sessions.
 *
 * Runs serially in one file. On success it persists the created client (and a
 * signed-in portal storageState) to .auth/fixtures.json for the module specs.
 */
import path from "node:path";
import { test, expect, pageAs, E2E_DIR, saveSharedFixtures } from "../../fixtures/test.js";
import { field, pngFile, uniq } from "../../helpers/ui.js";
import { E2E } from "../../helpers/env.js";

test.describe.configure({ mode: "serial" });

const clientName = uniq("Journey Groom");
const clientEmail = `journey.${Date.now().toString(36)}@e2e.gtb.test`;
const clientPhone = "+91 98765 00001";
const clientPassword = "groom-e2e-password";
const portalStatePath = path.join(E2E_DIR, ".auth", "journey-client.json");

let registrationUrl = "";

test("CRO creates a lead and gets a registration link", async ({ browser }) => {
  const page = await pageAs(browser, "cro");
  await page.goto("/clients/new");

  await field(page, "Full name").fill(clientName);
  await field(page, "Phone").fill(clientPhone);
  await field(page, "Email").fill(clientEmail);
  await field(page, "Big day date").fill("2027-03-15");
  await field(page, "City").fill("Bengaluru");
  await field(page, "Lead source").selectOption({ label: "Instagram" });
  await page.getByRole("button", { name: "Create lead" }).click();

  await expect(page.getByRole("heading", { name: "Lead created" })).toBeVisible();

  // Mailgun is unconfigured in e2e, so the invite yields a copyable link.
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Email not sent. Share this link")).toBeVisible();
  const link = await page.locator("code").textContent();
  expect(link).toBeTruthy();
  registrationUrl = link!.trim();
  expect(registrationUrl).toContain("http");
  await page.context().close();
});

test("client registers, completes onboarding, and submits first payment", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // The invite link verifies with GoTrue and lands on /portal/register#…
  await page.goto(registrationUrl);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await page.getByLabel("New password").fill(clientPassword);
  await page.getByLabel("Confirm password").fill(clientPassword);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 1: assessment (only the three required selects matter).
  await expect(page).toHaveURL(/\/portal\/onboarding/);
  await field(page, "Gender").selectOption("male");
  await field(page, "Skin type").selectOption("combination");
  await field(page, "Current fitness level").selectOption("beginner");
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 2: choose a plan.
  await page.getByRole("button", { name: "GTB (1 Month)" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();

  // Step 3 opens with a review of the choices; walk back through the wizard
  // (plan → assessment) and forward again, answers intact.
  await expect(page.getByRole("heading", { name: "Review your details" })).toBeVisible();
  await page.getByRole("button", { name: "Change plan" }).click();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(field(page, "Skin type")).toHaveValue("combination");
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Review your details" })).toBeVisible();

  // Pay PARTIALLY (₹2,000; the agreed ₹5,000 is recorded by the CRO later) —
  // payments.spec.ts needs the shared client to keep an outstanding balance —
  // then state the amount, upload proof + submit.
  await page.locator('input[type="number"]').fill("2000");
  await page.locator('input[type="file"]').setInputFiles(pngFile("payment-proof.png"));
  const submit = page.getByRole("button", { name: "Submit payment" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByRole("button", { name: "Go to my portal" })).toBeVisible();
  await page.getByRole("button", { name: "Go to my portal" }).click();
  await expect(page).toHaveURL(/\/portal$/);

  // Persist the signed-in portal session for the module specs.
  await context.storageState({ path: portalStatePath });
  await context.close();
});

test("CRO approves the first payment (lead → converted)", async ({ browser }) => {
  const page = await pageAs(browser, "cro");
  await page.goto("/payments");

  const row = page.locator("div").filter({ has: page.getByRole("link", { name: clientName }) });
  await row.getByRole("button", { name: "Approve" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Approve payment" });
  await expect(dialog).toBeVisible();
  await field(dialog, "Payment method").selectOption("upi");
  await dialog.getByRole("button", { name: /^Approve ·/ }).click();
  await expect(dialog).not.toBeVisible();

  // The client is now converted.
  await page.goto("/clients");
  const clientRow = page.locator("a, div, tr").filter({ hasText: clientName }).first();
  await expect(clientRow).toContainText(/converted/i);
  await page.context().close();
});

test("CRO records the client's negotiated price", async ({ browser }) => {
  // CROs negotiate fees, so they record the agreed price for their clients.
  const page = await pageAs(browser, "cro");
  await page.goto("/payments");
  await page.getByRole("button", { name: /^Collections/ }).click();

  const row = page
    .locator(".card > div")
    .filter({ has: page.getByRole("link", { name: clientName }) })
    .first();
  await expect(row).toContainText("Price not set");
  await row.getByRole("button", { name: "Set price" }).click();

  const dialog = page.getByRole("dialog", { name: `${clientName}'s payment schedule` });
  await field(dialog, "Agreed price (₹)").fill("5000");
  // A single milestone follows the price; it just needs a date.
  await expect(dialog.locator('input[type="number"]').nth(1)).toHaveValue("5000");
  await dialog.locator('input[type="date"]').first().fill("2027-01-31");
  await expect(dialog.getByText("Adds up ✓")).toBeVisible();
  await dialog.getByRole("button", { name: "Save schedule" }).click();
  await expect(dialog).not.toBeVisible();

  await expect(row).toContainText("of ₹5,000 paid");
  await page.context().close();
});

test("Ops Head assigns the team and activates the schedule", async ({ browser }) => {
  const page = await pageAs(browser, "ops_head");
  await page.goto("/assignments");

  const card = page.locator(".card").filter({ hasText: clientName }).first();
  await expect(card).toBeVisible();

  // Exactly one eligible staff member per slot is seeded, so index 1 is them.
  await card.getByLabel("Client Coach").selectOption({ index: 1 });
  await card.getByLabel("Skincare consultant").selectOption({ index: 1 });
  await card.getByLabel("Fitness consultant").selectOption({ index: 1 });
  await card.getByLabel("Styling consultant").selectOption({ index: 1 });
  await card.getByRole("button", { name: "Save team" }).click();

  const activate = card.getByRole("button", { name: "Activate & schedule" });
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect(card.getByText(/Activated\. \d+ sessions scheduled\./)).toBeVisible();
  await page.context().close();
});

test("consultant and client both see the scheduled sessions", async ({ browser }) => {
  const consultant = await pageAs(browser, "skincare_consultant");
  await consultant.goto("/consultations");
  await expect(consultant.getByText(clientName).first()).toBeVisible();
  await consultant.context().close();

  const context = await browser.newContext({ storageState: portalStatePath });
  const portal = await context.newPage();
  await portal.goto("/portal/sessions");
  await expect(portal.getByText(/skincare|fitness|styling/i).first()).toBeVisible();
  await context.close();

  saveSharedFixtures({
    client: {
      name: clientName,
      email: clientEmail,
      phone: clientPhone,
      password: clientPassword,
      storageState: portalStatePath,
    },
  });
});
