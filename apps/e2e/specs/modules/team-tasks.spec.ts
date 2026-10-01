/**
 * Team tasks: a coach creates a task assigned to themselves, then walks it
 * across the board using the quick-move arrow buttons ("→ In progress",
 * "→ Done") rather than drag-and-drop (pages/tasks/TeamTasksPage.tsx renders
 * both; the buttons are the deterministic path).
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test.js";
import { field, uniq } from "../../helpers/ui.js";
import { PERSONAS } from "../../helpers/roles.js";

test.describe.configure({ mode: "serial" });

const taskTitle = uniq("Task");

/** IST calendar date (the suite runs with Asia/Kolkata semantics). */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** A board column, found by its <h2> header ("To do" / "In progress" / "Done"). */
function column(page: Page, label: string): Locator {
  return page.locator(`div:has(> div > h2:text-is("${label}"))`);
}

function card(page: Page): Locator {
  return page.locator(".card").filter({ hasText: taskTitle });
}

test("coach creates a task assigned to themselves", async ({ asRole }) => {
  const page = await asRole("coach");
  await page.goto("/team-tasks");

  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();

  await field(dialog, "Title").fill(taskTitle);

  // Options render as "Name · Role"; resolve the coach's own option by name.
  const assign = field(dialog, "Assign to");
  const self = assign.locator("option", { hasText: PERSONAS.coach.name });
  const selfValue = await self.getAttribute("value");
  expect(selfValue).toBeTruthy();
  await assign.selectOption(selfValue!);

  await field(dialog, "Priority").selectOption("high");
  await field(dialog, "Due date").fill(istToday());
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).not.toBeVisible();

  await expect(column(page, "To do").getByText(taskTitle)).toBeVisible();
});

test("the arrow buttons move the task to In progress, then Done", async ({ asRole }) => {
  const page = await asRole("coach");
  await page.goto("/team-tasks");
  await expect(card(page)).toBeVisible();

  await card(page).getByRole("button", { name: "→ In progress" }).click();
  await expect(column(page, "In progress").getByText(taskTitle)).toBeVisible();
  await expect(column(page, "To do").getByText(taskTitle)).toBeHidden();

  await card(page).getByRole("button", { name: "→ Done" }).click();
  await expect(column(page, "Done").getByText(taskTitle)).toBeVisible();
  await expect(column(page, "In progress").getByText(taskTitle)).toBeHidden();
});
