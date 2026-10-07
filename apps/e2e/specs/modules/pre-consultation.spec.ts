/**
 * Pre-Consultation Assessment, staff side (GTB, Oct 2026). The journey client
 * submitted the form during onboarding; here the assigned skincare consultant
 * reviews it and downloads the PDF, the coach can't see it, and the ops head
 * uploads two consultation plan versions: both stay in the timeline, the
 * client sees only the active one.
 */
import { test, expect, portalPage, sharedClient } from "../../fixtures/test.js";
import { modal, pdfFile, uniq } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const v1Name = `${uniq("skin-plan-v1")}.pdf`;
const v2Name = `${uniq("skin-plan-v2")}.pdf`;

test("the skincare consultant reviews the assessment and downloads the PDF", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("skincare_consultant");
  await page.goto("/clients");
  await page.getByRole("link", { name: client.name }).first().click();
  await page.getByRole("button", { name: "Pre-consultation" }).click();

  await expect(page.getByRole("heading", { name: "Pre-Consultation Assessment" })).toBeVisible();
  for (const label of ["Front view", "Left side view", "Right side view"]) {
    await expect(page.getByRole("img", { name: label })).toBeVisible();
  }
  await expect(page.getByText("Eggetarian")).toBeVisible();
  await expect(page.getByText("Fat loss + muscle gain")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^GTB_Pre_Consultation_.+_GTB\d+_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test("the client coach cannot see the assessment", async ({ asRole }) => {
  const client = sharedClient();
  const page = await asRole("coach");
  await page.goto("/clients");
  await page.getByRole("link", { name: client.name }).first().click();
  await expect(page.getByRole("button", { name: /^Documents/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pre-consultation" })).toHaveCount(0);
});

test("ops uploads two plan versions; history keeps both, the client sees the latest", async ({
  asRole,
  browser,
}) => {
  const client = sharedClient();
  const page = await asRole("ops_head");
  await page.goto("/clients");
  await page.getByRole("link", { name: client.name }).first().click();
  await page.getByRole("button", { name: /^Documents/ }).click();

  // The system-generated assessment is in the timeline.
  await expect(page.getByText("Pre-Consultation Assessment")).toBeVisible();

  for (const [name, title] of [
    [v1Name, "Initial routine"],
    [v2Name, "Revised after week 2"],
  ] as const) {
    await page.getByRole("button", { name: "Upload Consultation Plan PDF" }).click();
    const dialog = modal(page, "Upload Consultation Plan PDF");
    await dialog.getByLabel("Document type").selectOption("skincare_plan");
    await dialog.getByLabel("Title or description").fill(title);
    await dialog.getByLabel("Plan PDF").setInputFiles(pdfFile(name));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
  }

  const v2Row = page.locator("div.flex.items-start").filter({ hasText: v2Name });
  const v1Row = page.locator("div.flex.items-start").filter({ hasText: v1Name });
  await expect(v2Row).toContainText("Version 2");
  await expect(v2Row).toContainText("Active");
  await expect(v2Row).toContainText("Revised after week 2");
  await expect(v1Row).toContainText("Version 1");
  await expect(v1Row).toContainText("Superseded");

  const portal = await portalPage(browser);
  await portal.goto("/portal/documents");
  await expect(portal.getByText(v2Name)).toBeVisible();
  await expect(portal.getByText(v1Name)).toHaveCount(0);
  await portal.context().close();
});
