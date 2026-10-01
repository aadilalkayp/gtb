/**
 * Reports: every tab renders its own content for the founder, and the CSV
 * export buttons produce a real download. Read-only — nothing is mutated.
 */
import { test, expect } from "../../fixtures/test.js";

// Tab label → a heading unique to that tab (a ReportCard title from the source).
const TABS: { label: string; heading: string }[] = [
  { label: "Revenue", heading: "Revenue vs collections" },
  { label: "Collections", heading: "Outstanding by client" },
  { label: "Sales", heading: "Lead source analysis" },
  { label: "Performance", heading: "CRO performance" },
  { label: "Expenses", heading: "Spend by category" },
  { label: "Operations", heading: "Session completion by service" },
];

test("every report tab renders its own content without errors", async ({ asRole }) => {
  const page = await asRole("founder");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  for (const { label, heading } of TABS) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    // Only the active tab's distinct content is on the page.
    for (const other of TABS.filter((t) => t.heading !== heading)) {
      await expect(page.getByRole("heading", { name: other.heading })).not.toBeVisible();
    }
    await expect(page.getByText("Couldn't load this data")).not.toBeVisible();
  }
});

test("the CSV button downloads an export", async ({ asRole }) => {
  const page = await asRole("founder");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Revenue vs collections" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});
