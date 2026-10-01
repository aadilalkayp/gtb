/**
 * Fitness module: trainer creates a plan for the shared client, edits a day,
 * leaves a note; the portal client logs weight and submits a weekly check-in;
 * the trainer replies to it. All additive flows on the shared client (rule 2);
 * no Session rows are touched (skincare → consultations.spec.ts, fitness →
 * portal.spec.ts).
 */
import { test, expect, portalPage, sharedClient } from "../../fixtures/test.js";
import { field, uniq } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const goalText = uniq("Shred for the big day");
const dayTitle = uniq("Custom Push");
const trainerNote = uniq("Hydration reminder");
const checkInNote = uniq("Felt strong this week");
const replyText = uniq("Great consistency");

let planUrl = "";

test("trainer creates a fitness plan for the shared client", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("fitness_trainer");
  await page.goto("/fitness");

  // Page header and empty-state both render a "New plan" button.
  await page.getByRole("button", { name: "New plan" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New fitness plan" });
  await expect(dialog).toBeVisible();

  // Client options render as "Name (CODE)" — resolve by name.
  const clientSelect = field(dialog, "Client");
  const optionValue = await clientSelect
    .locator("option", { hasText: client.name })
    .getAttribute("value");
  await clientSelect.selectOption(optionValue ?? "");

  // Non-admins get a disabled Trainer input pre-filled with themselves.
  await expect(field(dialog, "Trainer")).toHaveValue("Faris Fitness");
  await expect(field(dialog, "Trainer")).toBeDisabled();

  await field(dialog, "Goal").fill(goalText);
  await field(dialog, "Start date").fill(new Date().toISOString().slice(0, 10));
  await field(dialog, "Duration (days)").fill("30");
  await field(dialog, "Starting weight (kg)").fill("80");
  await field(dialog, "Target weight (kg)").fill("74");
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await expect(dialog).not.toBeVisible();

  const card = page.locator(".card").filter({ hasText: goalText });
  await expect(card).toBeVisible();
  await expect(card).toContainText(client.name);
  await expect(card).toContainText("Trainer: Faris Fitness");
});

test("trainer edits a plan day and adds a note", async ({ asRole }) => {
  const page = await asRole("fitness_trainer");
  await page.goto("/fitness");

  const card = page.locator(".card").filter({ hasText: goalText });
  await card.getByRole("link", { name: "View Details" }).click();
  await expect(page).toHaveURL(/\/fitness\/[^/]+$/);
  planUrl = page.url();

  // Plan tab: day 1 of the default "Fat Loss & Stamina" template is a
  // non-rest workout with exercises.
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Edit day 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Day 1 · / });
  await expect(dialog).toBeVisible();
  await field(dialog, "Workout title").fill(dayTitle);
  await dialog.getByRole("button", { name: "Save day" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(dayTitle)).toBeVisible();

  // Edit an exercise prescription (aria-labelled Sets input → "Save exercise").
  await page.getByRole("button", { name: "Edit day 1", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Sets").first().fill("5");
  await dialog.getByRole("button", { name: "Save exercise" }).click();
  await expect(dialog).not.toBeVisible();

  // Trainer note.
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await field(page, "Add a note").fill(trainerNote);
  await page.getByRole("button", { name: "Add Note" }).click();
  await expect(page.getByText(trainerNote)).toBeVisible();
});

test("portal client logs weight and submits the weekly check-in", async ({ browser }) => {
  const portal = await portalPage(browser);
  await portal.goto("/portal/fitness");
  await expect(portal.getByText(goalText)).toBeVisible();

  // Log weight.
  await portal.getByRole("button", { name: "Log weight" }).click();
  const weightDialog = portal.getByRole("dialog", { name: "Log today's weight" });
  await expect(weightDialog).toBeVisible();
  await field(weightDialog, "Weight (kg)").fill("78.4");
  await weightDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(weightDialog).not.toBeVisible();
  await expect(portal.getByText("78.4 kg").first()).toBeVisible();

  // Weekly check-in.
  await portal.getByRole("button", { name: "Submit Now" }).click();
  const checkInDialog = portal.getByRole("dialog", { name: /^Week \d+ check-in$/ });
  await expect(checkInDialog).toBeVisible();
  await checkInDialog.getByRole("button", { name: "4", exact: true }).click();
  await field(checkInDialog, "Weight this week (kg, optional)").fill("78.4");
  await field(checkInDialog, "Anything your trainer should know?").fill(checkInNote);
  await checkInDialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(checkInDialog).not.toBeVisible();
  await expect(portal.getByText(/Week \d+ submitted\./)).toBeVisible();

  await portal.context().close();
});

test("trainer sees the check-in and replies", async ({ asRole }) => {
  const page = await asRole("fitness_trainer");
  await page.goto(planUrl);

  await page.getByRole("button", { name: "Check-ins", exact: true }).click();
  const checkInCard = page.locator(".card").filter({ hasText: checkInNote });
  await expect(checkInCard).toBeVisible();
  await expect(checkInCard).toContainText(/Week \d+/);

  await field(checkInCard, "Reply to the client").fill(replyText);
  await checkInCard.getByRole("button", { name: "Send", exact: true }).click();
  await expect(checkInCard).toContainText("Trainer reply");
  await expect(checkInCard).toContainText(replyText);
});
