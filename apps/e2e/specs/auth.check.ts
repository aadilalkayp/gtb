/**
 * First gate of every run: each staff persona's saved session opens the
 * dashboard. The first authed API call also performs email→authId linking,
 * so after this file every persona is fully provisioned.
 */
import { test, expect } from "../fixtures/test.js";
import { STAFF_ROLES, PERSONAS } from "../helpers/roles.js";

for (const role of STAFF_ROLES) {
  test(`${role} session is valid and links on first login`, async ({ asRole }) => {
    const page = await asRole(role);
    await page.goto("/dashboard");
    // StaffLayout header: signed-in staff always see the sign-out control.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    // The persona's own name appears in the layout (profile chip).
    await expect(page.getByText(PERSONAS[role].name).first()).toBeVisible();
  });
}
