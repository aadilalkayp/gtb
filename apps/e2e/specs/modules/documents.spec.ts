/**
 * Documents library: an admin uploads a client-visible document, finds it via
 * search, and the client sees it in their portal.
 *
 * Type choice: admins (founder/ops_head) may upload any type (server upload
 * route's UPLOADER_BY_TYPE). "styling_guide" is client-visible — the Document
 * policy hides only consultation_notes from the owning client.
 */
import { test, expect, portalPage, sharedClient } from "../../fixtures/test.js";
import { field, pngFile, uniq } from "../../helpers/ui.js";

const fileName = `${uniq("styling-guide")}.png`;

test("ops head uploads a styling guide and the client sees it in the portal", async ({
  asRole,
  browser,
}) => {
  const client = sharedClient();
  const page = await asRole("ops_head");
  await page.goto("/documents");

  await page.getByRole("button", { name: "Upload" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload document" });
  await expect(dialog).toBeVisible();

  // Options render as "Name (CODE)" — resolve the shared client's option value.
  const clientSelect = field(dialog, "Client");
  const value = await clientSelect
    .locator("option", { hasText: client.name })
    .getAttribute("value");
  await clientSelect.selectOption(value ?? "");
  await field(dialog, "Type").selectOption("styling_guide");

  await dialog.locator('input[type="file"]').setInputFiles(pngFile(fileName));
  await expect(dialog.getByText("Uploaded")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).not.toBeVisible();

  // Find it via the search box (file-name match is server-side).
  await page.getByPlaceholder("Search by file or client…").fill(fileName);
  const row = page.locator(".card > button").filter({ hasText: fileName }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(client.name);
  await expect(row).toContainText("Styling Guide");

  // The owning client sees the document in their portal (styling_guide is not
  // one of the types hidden from clients).
  const portal = await portalPage(browser);
  await portal.goto("/portal/documents");
  await expect(portal.getByText(fileName)).toBeVisible();
  await expect(portal.getByText("Styling Guide")).toBeVisible();
  await portal.context().close();
});
