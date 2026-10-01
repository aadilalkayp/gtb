/**
 * Expense lifecycle: a consultant submits, an admin approves or rejects, and
 * the submitter sees the outcome. Rows are matched by their uniq() titles so
 * only expenses created here are ever mutated.
 */
import { test, expect, pageAs, sharedClient } from "../../fixtures/test.js";
import { field, pngFile, uniq } from "../../helpers/ui.js";
import type { Locator, Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const approvedTitle = uniq("Travel expense");
const rejectedTitle = uniq("Travel expense");
const REJECT_REASON = "No receipt matches this trip.";

function expenseRow(page: Page, title: string): Locator {
  return page.locator(".card > div").filter({ hasText: title }).first();
}

async function submitExpense(
  page: Page,
  opts: { title: string; amount: string; withReceipt: boolean },
): Promise<void> {
  await page.getByRole("button", { name: "Submit expense" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit expense" });
  await expect(dialog).toBeVisible();

  await field(dialog, "Category").selectOption({ label: "Travel" });
  await field(dialog, "Amount (₹)").fill(opts.amount);
  await field(dialog, "Title").fill(opts.title);
  await field(dialog, "Date").fill(new Date().toISOString().slice(0, 10));

  if (opts.withReceipt) {
    // A receipt upload needs a related client; link the shared journey client
    // (additive — the expense row itself is ours).
    const client = sharedClient();
    const clientSelect = field(dialog, "Related client");
    const value = await clientSelect
      .locator("option", { hasText: client.name })
      .getAttribute("value");
    await clientSelect.selectOption(value ?? "");
    await dialog.locator('input[type="file"]').setInputFiles(pngFile("receipt.png"));
    await expect(dialog.getByText("Uploaded")).toBeVisible();
  }

  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("skincare consultant submits a travel expense with a receipt", async ({ asRole }) => {
  const page = await asRole("skincare_consultant");
  await page.goto("/expenses");

  await submitExpense(page, { title: approvedTitle, amount: "1200", withReceipt: true });

  const row = expenseRow(page, approvedTitle);
  await expect(row).toBeVisible();
  await expect(row).toContainText("₹1,200");
  await expect(row).toContainText("Submitted");
  await expect(row.getByRole("button", { name: "Receipt" })).toBeVisible();
});

test("ops head approves it from the Pending tab", async ({ asRole }) => {
  const page = await asRole("ops_head");
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Pending", exact: true }).click();

  const row = expenseRow(page, approvedTitle);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Approve" }).click();

  // The approved row leaves the Pending list and shows approved under Approved.
  await expect(expenseRow(page, approvedTitle)).not.toBeVisible();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  const approvedRow = expenseRow(page, approvedTitle);
  await expect(approvedRow).toBeVisible();
  await expect(approvedRow).toContainText("Approved");
});

test("a second expense is rejected and the consultant sees why", async ({ asRole }) => {
  const consultant = await asRole("skincare_consultant");
  await consultant.goto("/expenses");
  await submitExpense(consultant, { title: rejectedTitle, amount: "800", withReceipt: false });
  await expect(expenseRow(consultant, rejectedTitle)).toBeVisible();

  const ops = await asRole("ops_head");
  await ops.goto("/expenses");
  await ops.getByRole("button", { name: "Pending", exact: true }).click();
  const row = expenseRow(ops, rejectedTitle);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Reject" }).click();

  const dialog = ops.getByRole("dialog", { name: "Reject expense" });
  await expect(dialog).toBeVisible();
  await field(dialog, "Reason").fill(REJECT_REASON);
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog).not.toBeVisible();

  // The submitter sees the rejected state with the reason.
  await consultant.reload();
  const rejectedRow = expenseRow(consultant, rejectedTitle);
  await expect(rejectedRow).toBeVisible();
  await expect(rejectedRow).toContainText(`Rejected: ${REJECT_REASON}`);
});
