/**
 * Public Transformation Readiness Scan funnel (/scan) — the product's only
 * unauthenticated surface.
 *
 *   Upload a selfie + big day date → teaser score → claim with contact
 *   details → full report at its /scan/r/:scanId permalink.
 *
 * GEMINI_API_KEY is unset in e2e, so the API returns deterministic stub
 * scores (modelVersion "stub") and framing always passes server-side. The
 * client-side pre-check (lib/framing.ts) only runs where the browser provides
 * FaceDetector — headless Chromium does not — so the 1px pngFile() upload
 * passes straight through.
 *
 * The scan API rate-limits to 6 scans/hour/IP; this file performs exactly ONE
 * scan (the whole funnel runs serially over it).
 */
import { test, expect } from "../../fixtures/test.js";
import { field, pngFile } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

const claimEmail = `scan.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}@e2e.gtb.test`;

test("anonymous visitor scans, claims, and sees the full report", async ({ page }) => {
  // Default `page` fixture carries no storageState — a fresh signed-out context.
  await page.goto("/scan");
  await expect(
    page.getByRole("heading", { name: /How ready are you for your/ }),
  ).toBeVisible();

  // The front selfie is the only required photo. ScanCapture renders hidden
  // file inputs in DOM order: front, fullBody, left, right.
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(pngFile("selfie.png"));
  // One optional angle for a fuller multi-photo scan (still the same single
  // /api/scan/start call — the rate limit counts scans, not photos).
  await inputs.nth(1).setInputFiles(pngFile("full-body.png"));

  await field(page, "Your big day").fill("2027-06-01");
  await field(page, "Grooming for").selectOption("groom");

  const scanButton = page.getByRole("button", { name: "Scan my readiness" });
  await expect(scanButton).toBeEnabled();
  await scanButton.click();

  // Teaser step: locked score ring + days countdown.
  await expect(page.getByText(/Your big day is in \d+ days/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Enter your details below to unlock the full report.")).toBeVisible();

  // Claim form (Name/Email/Phone required, City optional).
  await field(page, "Name").fill("Scan Sam");
  await field(page, "Email").fill(claimEmail);
  await field(page, "Phone").fill("+91 98765 43210");
  await field(page, "City").fill("Kochi");
  await page.getByRole("button", { name: "Unlock my full report" }).click();

  // The claim navigates to the permalink with the report in route state.
  await expect(page).toHaveURL(/\/scan\/r\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByText("Big Day Readiness")).toBeVisible();
  // The readiness score renders inside the hero ProgressRing as a bare number.
  await expect(page.locator("span.font-num").first()).toHaveText(/^\d+$/);

  // Direct visits (email, shares) refetch by scanId — a reload exercises that
  // read path on the same scan, costing nothing against the rate limit.
  await page.reload();
  await expect(page.getByText("Big Day Readiness")).toBeVisible();
  await expect(page.locator("span.font-num").first()).toHaveText(/^\d+$/);
});
