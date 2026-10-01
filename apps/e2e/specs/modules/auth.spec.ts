/**
 * Authentication flows: UI login/logout, error display, portal boundaries
 * (staff ↔ client), unauthenticated redirects, and the forgot-password form.
 *
 * All tests are read-only navigation and independent — no serial mode.
 */
import { test, expect, portalPage } from "../../fixtures/test.js";
import { PERSONAS } from "../../helpers/roles.js";
import { E2E } from "../../helpers/env.js";
import { e2ePool } from "../../helpers/db.js";
import { createAuthUser } from "../../helpers/supabaseAdmin.js";

test("staff can sign in through the login form and lands on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "GTB OS" })).toBeVisible();

  // LoginPage sets htmlFor on its <Field>s, so getByLabel works here.
  await page.getByLabel("Email").fill(PERSONAS.founder.email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("wrong password shows an error on the login form", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(PERSONAS.founder.email);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // LoginPage renders the Supabase error message in a red <p class="text-danger">.
  // Don't hard-code Supabase's wording — just assert an error appeared.
  const error = page.locator("form p.text-danger");
  await expect(error).toBeVisible();
  await expect(error).not.toBeEmpty();
  await expect(page).toHaveURL(/\/login$/);
});

test("sign out returns staff to the login page", async ({ browser }) => {
  // supabase.auth.signOut() revokes EVERY server-side session for the user
  // (global scope), which would kill a shared persona's saved storageState
  // for all later tests — so this test burns a disposable user instead.
  const email = `signout.${Date.now().toString(36)}@e2e.gtb.test`;
  const pool = e2ePool();
  try {
    await pool.query(
      `insert into "User" (id, email, name, role, "isActive", "createdAt", "updatedAt")
       values (gen_random_uuid(), $1, 'Disposable Signout', 'coach'::"Role", true, now(), now())`,
      [email],
    );
  } finally {
    await pool.end();
  }
  await createAuthUser(email);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("unauthenticated /portal redirects to /portal/login", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login$/);
});

test("staff visiting the client portal is bounced to the dashboard", async ({ asRole }) => {
  const page = await asRole("founder");
  // RequireClient sends non-clients to /dashboard.
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("client visiting the staff dashboard is bounced to the portal", async ({ browser }) => {
  // RequireStaff sends non-staff to /portal.
  const page = await portalPage(browser);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/portal$/);
  await page.context().close();
});

test("forgot-password page renders its form", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
});
