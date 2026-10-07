/**
 * Selector helpers tuned to GTB OS's component library.
 *
 * Most forms use <Field label="…"> which renders
 *   <div><label>Label *</label><input|select|textarea …/></div>
 * usually WITHOUT htmlFor, so Playwright's getByLabel can't see them. `field`
 * scopes to that wrapper div instead and works everywhere.
 */
import type { Locator, Page } from "@playwright/test";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The input/select/textarea under a <Field label="…">. */
export function field(scope: Page | Locator, label: string): Locator {
  // Backslashes must be doubled: the regex travels inside a CSS string, where
  // `\*` would collapse to `*` before :text-matches ever sees it.
  const pattern = `^${escapeRegex(label)}( \\*)?$`.replace(/\\/g, "\\\\");
  return scope
    .locator(`div:has(> label:text-matches("${pattern}"))`)
    .locator("input, select, textarea")
    .first();
}

/** An open modal dialog, narrowed by its title text. */
export function modal(page: Page, title: string | RegExp): Locator {
  return page.getByRole("dialog").filter({ hasText: title });
}

/** The hidden file input nearest to the given upload control/label text. */
export function fileInput(scope: Page | Locator): Locator {
  return scope.locator('input[type="file"]').first();
}

/** Unique per-run suffix so parallel specs never collide on names. */
export function uniq(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** A tiny valid PNG for upload fields (payment proofs, receipts, photos). */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export function pngFile(name = "proof.png"): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "image/png", buffer: TINY_PNG };
}

/** Minimal PDF (passes the upload route's %PDF magic-byte check). */
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

export function pdfFile(name = "plan.pdf"): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "application/pdf", buffer: TINY_PDF };
}

/**
 * Fill the Pre-Consultation Assessment (onboarding step 1 / /portal/assessment)
 * with valid answers and upload the three skin photos.
 */
export async function fillPreConsultation(page: Page): Promise<void> {
  await field(page, "Skin type").selectOption("combination");
  await page.getByRole("group", { name: "Current skin concerns" }).getByText("Acne marks").click();
  await page.getByRole("group", { name: "Current skin concerns" }).getByText("Dullness").click();
  await page
    .getByRole("radiogroup", { name: "Known skin allergies or product reactions" })
    .getByText("No", { exact: true })
    .click();
  await page
    .getByRole("radiogroup", { name: "Current dermatological treatment" })
    .getByText("No", { exact: true })
    .click();
  for (const angle of ["front", "left", "right"] as const) {
    await page.locator(`input[type="file"][data-angle="${angle}"]`).setInputFiles(pngFile(`${angle}.png`));
    await page
      .getByRole("button", { name: new RegExp(`^Replace ${angle} (side )?view photo$`) })
      .waitFor();
  }
  await field(page, "Current activity level").selectOption("lightly_active");
  await field(page, "Primary fitness goal").selectOption("fat_loss_muscle_gain");
  await field(page, "Height (cm)").fill("178");
  await field(page, "Weight (kg)").fill("76.5");
  await page
    .getByRole("radiogroup", { name: "Injury, medical condition or physical limitation" })
    .getByText("No", { exact: true })
    .click();
  await field(page, "Dietary preference").selectOption("eggetarian");
  await page.getByText(/^I confirm that the information provided is accurate/).click();
  await page.getByText(/^I understand that the information and photos/).click();
}
