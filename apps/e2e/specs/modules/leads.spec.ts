/**
 * Leads & client list: duplicate-phone detection on lead creation, the status
 * filter pills, per-row actions, and the client-profile tabs.
 *
 * The duplicate check (pages/clients/NewClientPage.tsx, FEAT-3) matches on
 * email OR phone, so a new lead reusing the shared journey client's phone
 * (from the shared fixtures) trips the
 * "Possible duplicate clients found" warning and requires ticking the
 * "I've verified this is a separate person. Create anyway" checkbox.
 *
 * The shared active client is only read here — no hold/complete/cancel.
 */
import { test, expect, sharedClient } from "../../fixtures/test.js";
import { field, uniq } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const leadName = uniq("Dup Lead");
const leadEmail = `dup.${Date.now().toString(36)}@e2e.gtb.test`;
test("a lead with a duplicate phone warns, then creates after confirmation", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/clients/new");

  await field(page, "Full name").fill(leadName);
  await field(page, "Phone").fill(sharedClient().phone);
  await field(page, "Email").fill(leadEmail);
  await field(page, "Big day date").fill("2027-06-20");
  await field(page, "City").fill("Mumbai");

  // The debounced lookup surfaces the shared client as a possible duplicate.
  await expect(page.getByText("Possible duplicate clients found")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: sharedClient().name })).toBeVisible();

  await page.getByLabel(/verified this is a separate person/).check();
  await page.getByRole("button", { name: "Create lead" }).click();

  await expect(page.getByRole("heading", { name: "Lead created" })).toBeVisible();
});

test("the status filter pills narrow the client list", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/clients");

  await page.getByRole("button", { name: "Lead", exact: true }).click();
  await expect(page.getByRole("link", { name: leadName })).toBeVisible();

  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(page.getByRole("link", { name: sharedClient().name })).toBeVisible();
  await expect(page.getByRole("link", { name: leadName })).toBeHidden();
});

test("row actions: leads get Invite, active clients get Open client", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/clients");

  const leadRow = page.locator(".card > div").filter({ hasText: leadName });
  await expect(leadRow.getByRole("button", { name: "Invite" })).toBeVisible();

  const activeRow = page.locator(".card > div").filter({ hasText: sharedClient().name });
  await expect(activeRow.getByRole("link", { name: "Open client" })).toBeVisible();
  await expect(activeRow.getByRole("button", { name: "Invite" })).toBeHidden();
});

test("the client profile tabs all switch content", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/clients");
  await page.getByRole("link", { name: sharedClient().name }).click();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);

  // Overview is the default tab. Tab buttons append a count badge to their
  // label, so the counted ones are matched by leading text.
  await expect(page.getByRole("heading", { name: "Plan & payments" })).toBeVisible();

  await page.getByRole("button", { name: /^Sessions/ }).click();
  await expect(page.getByText("Session 1").first()).toBeVisible();

  await page.getByRole("button", { name: /^Payments/ }).click();
  await expect(page.getByRole("heading", { name: "Expected schedule" })).toBeVisible();

  await page.getByRole("button", { name: /^Documents/ }).click();
  await expect(page.getByRole("button", { name: "Upload document" })).toBeVisible();

  await page.getByRole("button", { name: "Assessment" }).click();
  await expect(page.getByRole("heading", { name: "Skincare" })).toBeVisible();

  await page.getByRole("button", { name: "Scans" }).click();
  await expect(page.getByText("No readiness scans")).toBeVisible();
});
