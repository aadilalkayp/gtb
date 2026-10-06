/**
 * Styling Operations: only admins see the "New operation" button
 * (StylingOperationsPage renders it behind `isAdmin`), so the Ops Head creates
 * the operation with Stella assigned as stylist; the styling consultant then
 * works the checklist (stylists can edit their own operations), and the status
 * advances automatically: upcoming → in_progress (1+ items) → completed (all 5).
 * Before going out, the stylist can see whether the client has paid in full.
 */
import { test, expect, sharedClient } from "../../fixtures/test.js";
import { field, uniq } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const venue = uniq("Taj Ballroom");

// CHECKLIST labels from StylingOperationsPage, in order.
const CHECKLIST_LABELS = [
  "Consultation done",
  "Outfit finalized",
  "Accessories finalized",
  "Styling guide delivered",
  "Final confirmation",
] as const;

test("ops head creates a styling operation for the shared client", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("ops_head");
  await page.goto("/styling-operations");

  await page.getByRole("button", { name: "New operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New styling operation" });
  await expect(dialog).toBeVisible();

  // Client options render as "Name (CODE)" — resolve by name.
  const clientSelect = field(dialog, "Client");
  const optionValue = await clientSelect
    .locator("option", { hasText: client.name })
    .getAttribute("value");
  await clientSelect.selectOption(optionValue ?? "");

  await field(dialog, "Stylist").selectOption({ label: "Stella Styling" });
  await field(dialog, "Styling date").fill(
    new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
  );
  await field(dialog, "Location").fill(venue);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  const card = page.locator(".card").filter({ hasText: venue });
  await expect(card).toBeVisible();
  await expect(card).toContainText(client.name);
  await expect(card).toContainText("Stylist: Stella Styling");
  await expect(card).toContainText("Upcoming");
  await expect(card).toContainText("0/5");
});

// Labels from pages/styling/paymentClearance.tsx. The shared client's exact
// payment state depends on what the payments spec has done, so accept any.
const PAYMENT_LABEL =
  /Paid in full|Payment under review|Payment pending|Fee not recorded|No plan/;

test("stylist sees whether the client has paid, on the card and the dashboard", async ({
  asRole,
}) => {
  const client = sharedClient();
  const page = await asRole("styling_consultant");
  await page.goto("/styling-operations");
  const card = page.locator(".card").filter({ hasText: venue });
  await expect(card).toBeVisible();
  await expect(card.getByText(PAYMENT_LABEL).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "My styling sessions · payment status" }),
  ).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: client.name }).filter({
    hasText: PAYMENT_LABEL,
  });
  await expect(row.first()).toBeVisible();
});

test("stylist ticks the checklist and the status advances automatically", async ({
  asRole,
}) => {
  const page = await asRole("styling_consultant");
  await page.goto("/styling-operations");
  const card = page.locator(".card").filter({ hasText: venue });
  await expect(card).toBeVisible();

  // First item: upcoming → in_progress.
  // force: the card re-renders on react-query refetches, so Playwright's
  // stability check can spin; the checkbox itself is always clickable.
  // The checkbox is server-controlled: it only flips after the update
  // mutation + refetch, so click and then WAIT for the checked state rather
  // than using check(), which asserts an immediate flip.
  const first = card.getByLabel(CHECKLIST_LABELS[0]);
  await first.click({ force: true });
  await expect(first).toBeChecked();
  await expect(card).toContainText("In Progress");
  await expect(card).toContainText("1/5");

  // Remaining items, one by one (each toggle persists before the next).
  for (const label of CHECKLIST_LABELS.slice(1)) {
    const box = card.getByLabel(label);
    await box.click({ force: true });
    await expect(box).toBeChecked();
  }

  // All five checked: completed.
  await expect(card).toContainText("5/5");
  await expect(card).toContainText("Completed");
});
