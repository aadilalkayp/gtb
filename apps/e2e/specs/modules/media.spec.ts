/**
 * Media content pipeline: create a content item, advance it a stage on the
 * drag-and-drop kanban, and narrow the board with the platform filter.
 *
 * The board (pages/media/MediaPage.tsx) uses HTML5 drag events — cards are
 * `draggable` divs, columns handle dragover/drop — so `locator.dragTo()`
 * performs the move. Column headers are lowercase stage names ("planned",
 * "shooting", …) rendered capitalised via CSS.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test.js";
import { field, uniq } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const title = uniq("Reel");

/** A kanban column, found by its header stage name (direct-child structure). */
function column(page: Page, stage: string): Locator {
  return page.locator(`div:has(> div > span:text-is("${stage}"))`);
}

test("media creates a content item and it lands in the planned column", async ({ asRole }) => {
  const page = await asRole("media");
  await page.goto("/media");

  await page.getByRole("button", { name: "New content" }).click();
  const dialog = page.getByRole("dialog", { name: "New content" });
  await expect(dialog).toBeVisible();

  await field(dialog, "Title").fill(title);
  await field(dialog, "Type").selectOption("reel");
  await field(dialog, "Platform").selectOption("instagram");
  await field(dialog, "Deadline").fill("2027-01-15");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).not.toBeVisible();

  // New items default to the first stage of the pipeline.
  await expect(column(page, "planned").getByText(title)).toBeVisible();
});

test("dragging the card advances it to the shooting stage", async ({ asRole }) => {
  const page = await asRole("media");
  await page.goto("/media");

  const card = page.locator(".card").filter({ hasText: title });
  await expect(card).toBeVisible();

  await card.dragTo(column(page, "shooting"));

  await expect(column(page, "shooting").getByText(title)).toBeVisible();
  await expect(column(page, "planned").getByText(title)).toBeHidden();
});

test("the platform filter narrows the board", async ({ asRole }) => {
  const page = await asRole("media");
  await page.goto("/media");
  await expect(page.getByText(title)).toBeVisible();

  // The filter selects sit above the board without <Field> labels; each is
  // identified by its "All …" option text.
  const platformFilter = page.locator("select").filter({ hasText: "All platforms" });
  await platformFilter.selectOption("youtube");
  await expect(page.getByText(title)).toBeHidden();

  await platformFilter.selectOption("instagram");
  await expect(page.getByText(title)).toBeVisible();
});
