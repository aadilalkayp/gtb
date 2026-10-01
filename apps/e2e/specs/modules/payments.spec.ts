/**
 * Money flows — ALL ledger mutations for the shared journey client live here
 * (SPEC_GUIDE rule 3) so nothing races on the client's balance.
 *
 * Precondition (from the journey project): the shared client is active on
 * "GTB (1 Month)" with a negotiated price of ₹5,000 recorded by its CRO, one
 * approved payment and an outstanding balance left to collect.
 */
import { test, expect, pageAs, portalPage, sharedClient } from "../../fixtures/test.js";
import { field, pngFile } from "../../helpers/ui.js";
import type { Locator, Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

// The journey client's agreed price is ₹5,000; these amounts must stay inside the
// outstanding balance the journey leaves behind.
const RECORD_AMOUNT = 750;
const REJECTED_AMOUNT = 600;
const RESUBMIT_AMOUNT = 650;
const REJECT_REASON = "The screenshot does not show the amount or date.";

/** The shared client's row inside the current list card. */
function clientRow(page: Page, name: string): Locator {
  return page
    .locator(".card > div")
    .filter({ has: page.getByRole("link", { name }) })
    .first();
}

test("Collections lists the shared client with an outstanding balance", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("cro");
  await page.goto("/payments");
  await page.getByRole("button", { name: /^Collections/ }).click();

  const row = clientRow(page, client.name);
  await expect(row).toBeVisible();
  // The row shows "<paid> of ₹5,000 paid" plus the outstanding balance figure.
  await expect(row).toContainText("of ₹5,000 paid");
  await expect(row.getByRole("button", { name: "Record" })).toBeVisible();
  // CROs can also renegotiate the agreed price / schedule for their clients.
  await expect(row.locator('[title="Edit payment schedule"]')).toBeVisible();
});

test("ops head edits the payment schedule to two milestones", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("ops_head");
  await page.goto("/payments");
  await page.getByRole("button", { name: /^Collections/ }).click();

  // The schedule editor opens from the admin-only control (title attribute).
  await clientRow(page, client.name).locator('[title="Edit payment schedule"]').click();

  const dialog = page.getByRole("dialog", { name: `${client.name}'s payment schedule` });
  await expect(dialog).toBeVisible();

  // The agreed price recorded in the journey is prefilled.
  await expect(field(dialog, "Agreed price (₹)")).toHaveValue("5000");

  // Normalise to a single row, then build a 3000 + 2000 schedule. Number
  // input 0 is the agreed price; milestone amounts follow it.
  const removeButtons = dialog.locator('[title="Remove milestone"]');
  while ((await removeButtons.count()) > 1) {
    await removeButtons.first().click();
  }
  await dialog.locator('input[type="number"]').nth(1).fill("3000");
  await dialog.locator('input[type="date"]').first().fill("2027-01-15");

  await dialog.getByRole("button", { name: "Add milestone" }).click();
  await dialog.locator('input[type="number"]').nth(2).fill("2000");
  await dialog.locator('input[type="date"]').nth(1).fill("2027-02-20");

  // Live validation: the schedule sums exactly to the agreed price.
  await expect(dialog.getByText("Adds up ✓")).toBeVisible();
  await dialog.getByRole("button", { name: "Save schedule" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Payment schedule updated.")).toBeVisible();
});

test("CRO records an offline payment and it lands approved in History", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("cro");
  await page.goto("/payments");
  await page.getByRole("button", { name: /^Collections/ }).click();

  await clientRow(page, client.name).getByRole("button", { name: "Record" }).click();

  const dialog = page.getByRole("dialog", { name: "Record payment" });
  await expect(dialog).toBeVisible();
  await field(dialog, "Amount (₹)").fill(String(RECORD_AMOUNT));
  await field(dialog, "Payment method").selectOption("cash");
  await dialog.getByRole("button", { name: "Record" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Payment recorded.")).toBeVisible();

  // The recorded payment shows approved in History.
  await page.getByRole("button", { name: "History" }).click();
  const row = page
    .locator(".card > div")
    .filter({ has: page.getByRole("link", { name: client.name }) })
    .filter({ hasText: `₹${RECORD_AMOUNT}` })
    .first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Approved");
});

test("portal submission → reject → resubmit → approve", async ({ browser }) => {
  const client = sharedClient();

  // --- Client submits a payment with proof.
  const portal = await portalPage(browser);
  await portal.goto("/portal/payments");
  await expect(portal.getByRole("heading", { name: "Make a payment" })).toBeVisible();
  await portal.locator('input[type="number"]').fill(String(REJECTED_AMOUNT));
  await portal.locator('input[type="file"]').setInputFiles(pngFile("portal-proof.png"));
  await expect(portal.getByText("Uploaded")).toBeVisible();
  const submit = portal.getByRole("button", { name: "Submit payment" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(portal.getByText("Pending Review").first()).toBeVisible();

  // --- CRO rejects it with a reason.
  const cro = await pageAs(browser, "cro");
  await cro.goto("/payments"); // "To review" is the default tab
  const reviewRow = cro
    .locator(".card > div")
    .filter({ has: cro.getByRole("link", { name: client.name }) })
    .filter({ hasText: `₹${REJECTED_AMOUNT}` })
    .first();
  await reviewRow.getByRole("button", { name: "Reject" }).click();

  const rejectDialog = cro.getByRole("dialog", { name: "Reject payment" });
  await expect(rejectDialog).toBeVisible();
  await field(rejectDialog, "Reason").fill(REJECT_REASON);
  await rejectDialog.getByRole("button", { name: "Reject" }).click();
  await expect(rejectDialog).not.toBeVisible();
  await expect(cro.getByText("Payment rejected. The client has been notified.")).toBeVisible();

  // --- The client sees the rejection and resubmits.
  await portal.reload();
  await expect(portal.getByText(REJECT_REASON)).toBeVisible();
  await expect(portal.getByText("Rejected").first()).toBeVisible();

  await portal.locator('input[type="number"]').fill(String(RESUBMIT_AMOUNT));
  await portal.locator('input[type="file"]').setInputFiles(pngFile("portal-proof-2.png"));
  await expect(portal.getByText("Uploaded")).toBeVisible();
  await portal.getByRole("button", { name: "Submit payment" }).click();
  await expect(
    portal.locator(".card > div").filter({ hasText: `₹${RESUBMIT_AMOUNT}` }).first(),
  ).toBeVisible();

  // --- CRO approves the resubmission.
  await cro.reload();
  const resubmitRow = cro
    .locator(".card > div")
    .filter({ has: cro.getByRole("link", { name: client.name }) })
    .filter({ hasText: `₹${RESUBMIT_AMOUNT}` })
    .first();
  await resubmitRow.getByRole("button", { name: "Approve" }).click();

  const approveDialog = cro.getByRole("dialog", { name: "Approve payment" });
  await expect(approveDialog).toBeVisible();
  await field(approveDialog, "Payment method").selectOption("upi");
  await approveDialog.getByRole("button", { name: /^Approve ·/ }).click();
  await expect(approveDialog).not.toBeVisible();
  await expect(cro.getByText("Payment approved.")).toBeVisible();

  // --- The client sees the approval.
  await portal.reload();
  const approvedRow = portal
    .locator(".card > div")
    .filter({ hasText: `₹${RESUBMIT_AMOUNT}` })
    .filter({ hasText: "Approved" })
    .first();
  await expect(approvedRow).toBeVisible();

  await cro.context().close();
  await portal.context().close();
});
