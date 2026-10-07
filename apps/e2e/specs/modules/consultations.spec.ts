/**
 * Consultations module: the skincare consultant's session queue.
 *
 * Consumes the shared client's two scheduled SKINCARE sessions (rule 4 —
 * fitness sessions belong to portal.spec.ts): complete one (which auto-creates
 * the ₹500 consultant-fee payout expense), reschedule the other.
 */
import { test, expect, sharedClient } from "../../fixtures/test.js";
import { field } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const sessionNote = `Covered cleansing routine ${Date.now().toString(36)}`;

/** Mirror of @gtb/shared formatDate (IST, en-IN, "1 Oct 2026"). */
function fmtIST(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test("skincare consultant sees the client's sessions with scope and time filters", async ({
  asRole,
}) => {
  const client = sharedClient();
  const page = await asRole("skincare_consultant");
  await page.goto("/consultations");

  // Scope pills (consultants only) and the time pill filter.
  await expect(page.getByRole("button", { name: "My sessions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All sessions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upcoming", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Past", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();

  // Default scope is "mine" + "upcoming": both scheduled skincare sessions show.
  await page.getByRole("button", { name: "Skincare", exact: true }).click();
  const rows = page
    .locator(".card > div")
    .filter({ has: page.getByRole("link", { name: client.name }) });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Scheduled");
});

test("consultant completes a skincare session", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("skincare_consultant");
  await page.goto("/consultations");
  await page.getByRole("button", { name: "Skincare", exact: true }).click();

  const rows = page
    .locator(".card > div")
    .filter({ has: page.getByRole("link", { name: client.name }) });
  await rows.first().getByRole("button", { name: "Complete", exact: true }).click();

  // Modal title: `Complete ${SERVICE_TYPE_LABELS[svc]} session ${sessionNumber}`.
  const dialog = page.getByRole("dialog", { name: /^Complete Skincare session \d+$/ });
  await expect(dialog).toBeVisible();
  await field(dialog, "Actual date").fill(isoDaysFromNow(0));
  await field(dialog, "Internal note").fill(sessionNote);
  await dialog.getByRole("button", { name: "Mark completed" }).click();
  await expect(dialog).not.toBeVisible();

  // Completed sessions leave "Upcoming"; they show under "Past".
  await page.getByRole("button", { name: "Past", exact: true }).click();
  const completedRow = page.locator(".card > div").filter({ hasText: sessionNote });
  await expect(completedRow).toContainText(client.name);
  await expect(completedRow).toContainText("Completed");
});

test("completing created a pending Consultant Fee payout for the consultant", async ({
  asRole,
}) => {
  const client = sharedClient();
  const page = await asRole("founder");
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Pending", exact: true }).click();

  // sessionCompletion.ts: title "Skincare session N — <client>", category
  // "Consultant Fee", payee = consultant, amount = seeded ₹500 rate.
  const row = page
    .locator(".card > div")
    .filter({ hasText: client.name })
    .filter({ hasText: "Payout to Sana Skincare" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/Skincare session \d+/);
  await expect(row).toContainText("Consultant Fee");
  await expect(row).toContainText("₹500");
  await expect(row).toContainText("Submitted");
});

test("consultant reschedules the remaining skincare session", async ({ asRole }) => {
  const client = sharedClient();
  const newDate = isoDaysFromNow(45);
  const page = await asRole("skincare_consultant");
  await page.goto("/consultations");
  await page.getByRole("button", { name: "Skincare", exact: true }).click();

  // Only the still-scheduled session remains in "Upcoming".
  const rows = page
    .locator(".card > div")
    .filter({ has: page.getByRole("link", { name: client.name }) });
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole("button", { name: "Reschedule", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Reschedule session" });
  await expect(dialog).toBeVisible();
  await field(dialog, "New date").fill(newDate);
  await dialog.getByRole("button", { name: "Reschedule" }).click();
  await expect(dialog).not.toBeVisible();

  await expect(rows.first()).toContainText(fmtIST(newDate));
});
