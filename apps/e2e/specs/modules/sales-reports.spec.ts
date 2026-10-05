/**
 * CRO daily sales reports (SALES_REPORTS_DESIGN.md): the CRO files and edits
 * today's report from the dashboard nudge, leads carry their creator for sales
 * credit, the founder reads the team view, and access is CRO-writes /
 * founder-reads only. This file owns the CRO persona's SalesReport rows.
 */
import type { Page } from "@playwright/test";
import { workDayKey } from "@gtb/shared";
import { test, expect } from "../../fixtures/test.js";
import { e2ePool } from "../../helpers/db.js";
import { E2E } from "../../helpers/env.js";
import { PERSONAS, type StaffRole } from "../../helpers/roles.js";
import { field, uniq } from "../../helpers/ui.js";

test.describe.configure({ mode: "serial" });

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = e2ePool();
  try {
    return (await pool.query<T>(text, params)).rows;
  } finally {
    await pool.end();
  }
}

async function userId(role: StaffRole): Promise<string> {
  const [row] = await sql<{ id: string }>(`select id from "User" where email = $1`, [PERSONAS[role].email]);
  if (!row) throw new Error(`no User row for ${role}`);
  return row.id;
}

async function tokenOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    return (JSON.parse(localStorage.getItem(key ?? "") ?? "{}") as { access_token?: string }).access_token ?? "";
  });
}

const challenge = uniq("Need brochure for Kochi leads");

test.beforeAll(async () => {
  await sql(`delete from "SalesReport" where "croId" = $1`, [await userId("cro")]);
});

test("a CRO files today's report from the dashboard and edits it before the deadline", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/dashboard");
  await expect(page.getByText("Today's report is not in yet")).toBeVisible();
  await page.getByRole("button", { name: "Fill in report" }).click();

  await expect(page.getByRole("heading", { name: "Daily Report" })).toBeVisible();
  await page.getByLabel("New enquiries handled").fill("14");
  await page.getByLabel("Lead follow-ups done").fill("9");
  await page.getByLabel("Hot leads").fill("3");
  await page.getByLabel("Follow-ups planned for tomorrow").fill("6");
  await page.getByLabel("Challenges or support needed").fill(challenge);
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

  await page.getByLabel("New enquiries handled").fill("15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  const [row] = await sql<{ enquiries: number; editedAt: Date | null; day: string }>(
    `select enquiries, "editedAt", to_char(day, 'YYYY-MM-DD') as day from "SalesReport" where "croId" = $1`,
    [await userId("cro")],
  );
  expect(row).toMatchObject({ enquiries: 15, day: workDayKey(new Date()) });
  expect(row?.editedAt).not.toBeNull();

  // The edit is in the Team Pulse audit trail.
  await expect
    .poll(async () =>
      (await sql(`select 1 from "ActivityLog" where "entityType" = 'SalesReport' and verb = 'salesreport.edited'`)).length,
    )
    .toBeGreaterThan(0);

  await page.goto("/dashboard");
  await expect(page.getByText("Today's report is in")).toBeVisible();
});

test("a lead is credited to the CRO who created it, and the creator cannot be spoofed", async ({ asRole }) => {
  const page = await asRole("cro");
  const croId = await userId("cro");
  const name = uniq("Credit Lead");
  const email = `credit.${Date.now().toString(36)}@e2e.gtb.test`;
  await page.goto("/clients/new");
  await field(page, "Full name").fill(name);
  await field(page, "Phone").fill(`9${Date.now().toString().slice(-9)}`);
  await field(page, "Email").fill(email);
  await field(page, "Big day date").fill("2027-06-20");
  await field(page, "City").fill("Kochi");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead created" })).toBeVisible();

  const [lead] = await sql<{ createdById: string | null }>(`select "createdById" from "Client" where email = $1`, [email]);
  expect(lead?.createdById).toBe(croId);

  // Through the gateway, the creator can only ever be the caller.
  const spoof = await page.request.post(`${E2E.apiUrl}/api/model/client/create`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
    data: {
      data: {
        clientCode: `GTB${Math.floor(10000 + Math.random() * 89999)}`,
        name: uniq("Spoof Lead"),
        phone: "9111111111",
        email: `spoof.${Date.now().toString(36)}@e2e.gtb.test`,
        type: "groom",
        weddingDate: "2027-06-20T00:00:00.000Z",
        city: "Kochi",
        createdById: await userId("founder"),
      },
    },
  });
  expect(spoof.ok()).toBeFalsy();

  // The new lead shows up in the CRO's own "From GTB OS today".
  const mine = await page.request.get(`${E2E.apiUrl}/api/sales-reports/mine`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
  });
  const body = (await mine.json()) as {
    today: string;
    days: Array<{ day: string; figures: { leadsAdded: number } }>;
    monthToDate: { leadsAdded: number; sales: number };
  };
  expect(body.days.find((d) => d.day === body.today)?.figures.leadsAdded).toBeGreaterThanOrEqual(1);
  // The dashboard's "Conversions this month" tile reads the same credited figures.
  expect(body.monthToDate.leadsAdded).toBeGreaterThanOrEqual(1);
  await page.goto("/dashboard");
  await expect(page.getByText("Conversions this month")).toBeVisible();
});

test("the founder reads the team view and opens a report; no submit form for founders", async ({ asRole }) => {
  const page = await asRole("founder");
  await page.goto("/sales-reports");
  await expect(page.getByRole("heading", { name: "Sales Reports" })).toBeVisible();
  await expect(page.getByText("Reports in")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit report" })).toHaveCount(0);

  const row = page.locator("tr").filter({ hasText: PERSONAS.cro.name });
  await expect(row.getByText("Submitted", { exact: true })).toBeVisible();
  await row.click();
  const dialog = page.getByRole("dialog", { name: new RegExp(PERSONAS.cro.name) });
  await expect(dialog.getByText(challenge)).toBeVisible();
  await expect(dialog.getByText("Recorded in GTB OS")).toBeVisible();
  await dialog.press("Escape");

  // The challenge is also surfaced on its own.
  await expect(page.getByText("Challenges and support needed")).toBeVisible();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByText("Enquiries reported vs leads added in GTB OS")).toBeVisible();
  await expect(page.getByText(challenge)).toBeVisible();
});

test("only CROs file and only founders read: nav, pages and API", async ({ asRole }) => {
  const founder = await asRole("founder");
  await founder.goto("/dashboard");
  await expect(founder.getByRole("link", { name: "Sales Reports" })).toBeVisible();
  await expect(founder.getByRole("link", { name: "Daily Report" })).toHaveCount(0);
  await founder.goto("/daily-report");
  await expect(founder.getByText("You don't have access to this page.")).toBeVisible();
  const founderPut = await founder.request.put(`${E2E.apiUrl}/api/sales-reports/mine`, {
    headers: { Authorization: `Bearer ${await tokenOf(founder)}` },
    data: { day: workDayKey(new Date()), dayOff: true },
  });
  expect(founderPut.status()).toBe(403);

  const cro = await asRole("cro");
  await cro.goto("/dashboard");
  await expect(cro.getByRole("link", { name: "Daily Report" })).toBeVisible();
  await expect(cro.getByRole("link", { name: "Sales Reports" })).toHaveCount(0);
  await cro.goto("/sales-reports");
  await expect(cro.getByText("You don't have access to this page.")).toBeVisible();
  const croToken = await tokenOf(cro);
  for (const path of ["/api/sales-reports/day", "/api/sales-reports/period", "/api/sales-reports/export"]) {
    const res = await cro.request.get(`${E2E.apiUrl}${path}`, { headers: { Authorization: `Bearer ${croToken}` } });
    expect(res.status(), `cro ${path}`).toBe(403);
  }

  for (const role of ["ops_head", "coach"] as const) {
    const page = await asRole(role);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sales Reports" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Daily Report" })).toHaveCount(0);
    const token = await tokenOf(page);
    for (const path of ["/api/sales-reports/day", "/api/sales-reports/mine"]) {
      const res = await page.request.get(`${E2E.apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status(), `${role} ${path}`).toBe(403);
    }
  }
  const anon = await founder.request.get(`${E2E.apiUrl}/api/sales-reports/day`);
  expect(anon.status()).toBe(401);
});

test("the founder exports the CSV, and the export is audited", async ({ asRole }) => {
  const page = await asRole("founder");
  const founderId = await userId("founder");
  const day = workDayKey(new Date());
  await page.goto("/sales-reports");
  await expect(page.getByRole("heading", { name: "Sales Reports" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe(`sales-reports-${day}-to-${day}.csv`);

  await expect
    .poll(async () =>
      (
        await sql(
          `select 1 from "ActivityLog" where verb = 'report.exported' and "performedById" = $1
             and meta->>'report' = 'Sales daily reports'`,
          [founderId],
        )
      ).length,
    )
    .toBeGreaterThan(0);
});

test("a CRO can switch today to a day off and back to a report", async ({ asRole }) => {
  const page = await asRole("cro");
  await page.goto("/daily-report");
  await page.getByRole("button", { name: "Mark as day off" }).click();
  await expect(page.getByText("You marked this as a day off.")).toBeVisible();
  await expect(page.getByText("Day off", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Fill in a report instead" }).click();
  for (const label of ["New enquiries handled", "Lead follow-ups done", "Hot leads", "Follow-ups planned for tomorrow"]) {
    await page.getByLabel(label).fill("1");
  }
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
