/**
 * Client portal flows over the shared journey client.
 *
 *   fitness_trainer completes one FITNESS session (this file owns the shared
 *   client's fitness sessions — consultations.spec.ts owns skincare) → the
 *   client sees it on /portal/sessions and rates it → the client edits a
 *   non-critical profile field.
 *
 * All additive; no cancels/holds, and "Update password" is never touched.
 */
import { test, expect, pageAs, portalPage, sharedClient } from "../../fixtures/test.js";
import { field } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

test("fitness trainer completes one of the shared client's fitness sessions", async ({
  browser,
}) => {
  const client = sharedClient();
  const page = await pageAs(browser, "fitness_trainer");
  await page.goto("/consultations");

  // Show every session (the PillFilter's "All"), keeping the trainer's
  // default "My sessions" scope — the journey assigned them to this client.
  await page.getByRole("button", { name: "All", exact: true }).click();

  // An open fitness session row for the shared client (open rows carry the
  // Complete button).
  const row = page
    .locator(".card > div")
    .filter({ hasText: client.name })
    .filter({ hasText: /Fitness #\d+/ })
    .filter({ has: page.getByRole("button", { name: "Complete" }) })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Complete" }).click();

  const dialog = page.getByRole("dialog", { name: /^Complete Fitness session/ });
  await expect(dialog).toBeVisible();
  await field(dialog, "Actual date").fill(new Date().toISOString().slice(0, 10));
  await field(dialog, "Internal note").fill("Full-body baseline workout, good form.");
  await dialog.getByRole("button", { name: "Mark completed" }).click();
  await expect(dialog).not.toBeVisible();
  await page.context().close();
});

test("client sees home content and rates the completed fitness session", async ({ browser }) => {
  const portal = await portalPage(browser);

  // Portal home renders the countdown hero and plan progress.
  await portal.goto("/portal");
  await expect(portal.getByText(/days to go/)).toBeVisible();
  await expect(portal.getByText(/of \d+ sessions done/)).toBeVisible();

  // Sessions list: the completed fitness session sits under "Past" with Rate.
  await portal.goto("/portal/sessions");
  await expect(portal.getByRole("heading", { name: "My sessions" })).toBeVisible();
  await expect(portal.getByText("Past")).toBeVisible();

  const row = portal
    .locator(".card > div")
    .filter({ hasText: /Fitness · Session \d+/ })
    .filter({ has: portal.getByRole("button", { name: "Rate", exact: true }) })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Rate", exact: true }).click();

  const dialog = portal.getByRole("dialog", { name: "Rate your session" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "4 stars" }).click();
  await dialog.locator("textarea").fill("Great session, felt the difference already.");
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog).not.toBeVisible();

  // Rated state: no fitness row offers Rate any more (the stars replace it) —
  // this file completed the only fitness session that can be rated.
  await expect(
    portal
      .locator(".card > div")
      .filter({ hasText: /Fitness · Session \d+/ })
      .filter({ has: portal.getByRole("button", { name: "Rate", exact: true }) }),
  ).toHaveCount(0);
  await portal.context().close();
});

test("client edits their phone on the profile and it persists", async ({ browser }) => {
  const portal = await portalPage(browser);
  const newPhone = `+91 90000 ${String(Date.now()).slice(-5)}`;

  await portal.goto("/portal/profile");
  await expect(portal.getByRole("heading", { name: "My profile" })).toBeVisible();

  // Contact details card: Phone is the non-critical field (the editable city
  // doesn't exist here — only Full name / Phone are editable, and the shared
  // client's name must stay stable for other specs).
  await field(portal, "Phone").fill(newPhone);
  await portal.getByRole("button", { name: "Save changes" }).click();
  await expect(portal.getByText("Saved", { exact: true })).toBeVisible();

  await portal.reload();
  await expect(field(portal, "Phone")).toHaveValue(newPhone);
  await portal.context().close();
});
