/**
 * CRO tracking: create a follow-up due today for the shared client, complete
 * it with notes, then snooze a second one.
 *
 * Snooze (pages/cro/CroTrackingPage.tsx) sets dueDate to tomorrow, so a
 * snoozed follow-up leaves "Due today" and shows up under "Upcoming". The two
 * tests use different follow-up types so their rows never collide:
 * "satisfaction_check" and "payment_reminder" both have cadence 0, so
 * completing one does not auto-create a successor.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect, sharedClient } from "../../fixtures/test.js";
import { field } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

/** IST calendar date — matches the page's IST-pinned "today" window. */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** A follow-up list row for a client + type-label pair. */
function row(page: Page, clientName: string, typeLabel: string): Locator {
  return page
    .locator(".card > div")
    .filter({ hasText: clientName })
    .filter({ hasText: typeLabel });
}

async function createFollowUp(page: Page, clientName: string, type: string): Promise<void> {
  await page.getByRole("button", { name: "New follow-up" }).click();
  const dialog = page.getByRole("dialog", { name: "New follow-up" });
  await expect(dialog).toBeVisible();

  // Options render as "Name (CODE)"; resolve the shared client by name.
  const client = field(dialog, "Client");
  const option = client.locator("option", { hasText: clientName });
  const value = await option.getAttribute("value");
  expect(value).toBeTruthy();
  await client.selectOption(value!);

  await field(dialog, "Type").selectOption(type);
  await field(dialog, "Due date").fill(istToday());
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).not.toBeVisible();
}

test("cro creates a follow-up that appears under Due today", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/cro-tracking");

  await createFollowUp(page, sharedClient().name, "satisfaction_check");

  await page.getByRole("button", { name: /^Due today/ }).click();
  await expect(row(page, sharedClient().name, "Satisfaction Check").first()).toBeVisible();
});

test("completing the follow-up moves it to Completed", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/cro-tracking");

  const due = row(page, sharedClient().name, "Satisfaction Check").first();
  await expect(due).toBeVisible();
  await due.getByRole("button", { name: "Complete" }).click();

  const dialog = page.getByRole("dialog", { name: "Complete satisfaction check" });
  await expect(dialog).toBeVisible();
  await field(dialog, "Notes").fill("Spoke to the client, all good.");
  await dialog.getByRole("button", { name: "Mark done" }).click();
  await expect(dialog).not.toBeVisible();

  // Gone from Due today, listed (with the Done badge) under Completed.
  await expect(row(page, sharedClient().name, "Satisfaction Check").first()).toBeHidden();
  await page.getByRole("button", { name: "Completed" }).click();
  const done = row(page, sharedClient().name, "Satisfaction Check").first();
  await expect(done).toBeVisible();
  await expect(done.getByText("Done")).toBeVisible();
});

test("snoozing a follow-up moves it from Due today to Upcoming", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/cro-tracking");

  await createFollowUp(page, sharedClient().name, "payment_reminder");

  const due = row(page, sharedClient().name, "Payment Reminder").first();
  await expect(due).toBeVisible();
  await due.getByRole("button", { name: "Snooze" }).click();

  // Snooze re-dates it to tomorrow: out of today's list, into Upcoming.
  await expect(row(page, sharedClient().name, "Payment Reminder").first()).toBeHidden();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(row(page, sharedClient().name, "Payment Reminder").first()).toBeVisible();
});
