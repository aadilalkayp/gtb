/**
 * Role × route access matrix for capability-gated staff routes.
 *
 * RequireCapability renders "You don't have access to this page." in place of
 * the page content (no redirect), so allowed roles must see the page heading
 * and never the denial text, while denied roles must see the denial text.
 *
 * Allowed-role lists are derived from ROLE_CAPABILITIES in
 * packages/shared/src/permissions.ts so the matrix can never drift from the
 * real permission source.
 */
import { ROLE_CAPABILITIES, type Capability } from "@gtb/shared";
import { test, expect } from "../../fixtures/test.js";
import { STAFF_ROLES, type StaffRole } from "../../helpers/roles.js";

const DENIAL_TEXT = "You don't have access to this page.";

interface GatedRoute {
  path: string;
  heading: string;
  capability: Capability;
}

// Routes wrapped in <RequireCapability> in apps/web/src/App.tsx, with each
// page's <PageHeader title>.
const GATED_ROUTES: GatedRoute[] = [
  { path: "/assignments", heading: "Assignments", capability: "client.assign_consultants" },
  { path: "/media", heading: "Media", capability: "media.manage" },
  { path: "/reports", heading: "Reports", capability: "report.view_all" },
  { path: "/alerts", heading: "Alerts", capability: "report.view_all" },
  { path: "/styling-operations", heading: "Styling Operations", capability: "styling.manage" },
  { path: "/fitness", heading: "Fitness Operations", capability: "fitness.manage" },
];

function allowedRoles(capability: Capability): StaffRole[] {
  return STAFF_ROLES.filter((role) => ROLE_CAPABILITIES[role].includes(capability));
}

for (const route of GATED_ROUTES) {
  const allowed = allowedRoles(route.capability);

  for (const role of STAFF_ROLES) {
    if (allowed.includes(role)) {
      test(`${role} can access ${route.path}`, async ({ asRole }) => {
        const page = await asRole(role);
        await page.goto(route.path);
        await expect(
          page.getByRole("heading", { name: route.heading, exact: true }),
        ).toBeVisible();
        await expect(page.getByText(DENIAL_TEXT)).not.toBeVisible();
      });
    } else {
      test(`${role} is denied ${route.path}`, async ({ asRole }) => {
        const page = await asRole(role);
        await page.goto(route.path);
        await expect(page.getByText(DENIAL_TEXT)).toBeVisible();
        await expect(
          page.getByRole("heading", { name: route.heading, exact: true }),
        ).not.toBeVisible();
      });
    }
  }
}

// /settings is reachable by every staff role, but its tabs are capability
// gated (see apps/web/src/pages/settings/SettingsPage.tsx): "Plans" needs
// plan.manage and "Team & Users" needs user.manage — founder only. ops_head
// holds leadsource.manage, so they still see "Lead Sources".
test("founder sees the Plans and Team & Users settings tabs", async ({ asRole }) => {
  const page = await asRole("founder");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plans", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team & Users", exact: true })).toBeVisible();
});

test("ops_head does not see the Team & Users settings tab", async ({ asRole }) => {
  const page = await asRole("ops_head");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  // Their only tab with a granted capability is Lead Sources.
  await expect(page.getByRole("button", { name: "Lead Sources", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team & Users", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Plans", exact: true })).not.toBeVisible();
});
