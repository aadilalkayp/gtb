/**
 * Team Pulse capture + presence (TEAM_PULSE_DESIGN.md phases 1-2): the browser
 * heartbeat, audit capture of gateway writes, key views/exports, sign-ins, and
 * founder-only read access. Assertions go straight to Postgres: nothing here
 * is visible in the UI (by design, staff never see it).
 */
import type { Page } from "@playwright/test";
import { test, expect, sharedClient } from "../../fixtures/test.js";
import { e2ePool } from "../../helpers/db.js";
import { E2E } from "../../helpers/env.js";
import { PERSONAS, type StaffRole } from "../../helpers/roles.js";
import { uniq } from "../../helpers/ui.js";

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

/** The persona's Supabase access token, from the signed-in page. */
async function tokenOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    return (JSON.parse(localStorage.getItem(key ?? "") ?? "{}") as { access_token?: string }).access_token ?? "";
  });
}

function heartbeats(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/heartbeat")) seen.push(r.postData() ?? "");
  });
  return seen;
}

test("real input sends a heartbeat that marks the minute active in the right module", async ({ asRole }) => {
  const page = await asRole("cro");
  const id = await userId("cro");
  await page.goto("/cro-tracking");
  await expect(page.getByRole("heading", { name: "CRO Tracking" })).toBeVisible();

  const beat = page.waitForRequest((r) => r.url().endsWith("/api/heartbeat"));
  await page.mouse.move(200, 300);
  await page.mouse.move(260, 340);
  expect(JSON.parse((await beat).postData() ?? "{}")).toEqual({ module: "cro" });
  const beatAt = Date.now();

  // The minute is marked active. (Other specs drive the same CRO persona in
  // parallel, and the first tab to beat in a minute names its module, so the
  // module itself is asserted on the request above.)
  await expect
    .poll(async () =>
      (
        await sql(
          // timestamp(3) columns hold UTC; pass ISO strings and cast, since
          // node-pg sends Dates as local time and a plain timestamp drops the offset.
          `select 1 from "ActiveMinute" where "userId" = $1
             and minute between ($2::timestamptz at time zone 'UTC') and ($3::timestamptz at time zone 'UTC')`,
          [id, new Date(beatAt - 90_000).toISOString(), new Date(beatAt + 60_000).toISOString()],
        )
      ).length,
    )
    .toBeGreaterThan(0);
  const [day] = await sql<{ activeMinutes: number }>(
    `select "activeMinutes" from "StaffDay" where "userId" = $1 order by day desc limit 1`,
    [id],
  );
  expect(day?.activeMinutes).toBeGreaterThan(0);
});

test("an idle open tab sends no heartbeat", async ({ asRole }) => {
  const page = await asRole("media");
  const seen = heartbeats(page);
  await page.goto("/media");
  await expect(page.getByRole("heading", { name: "Media", exact: true })).toBeVisible();
  // Longer than the 10s check interval, with no input at all.
  await page.waitForTimeout(12_000);
  expect(seen).toEqual([]);
});

test("founders are never tracked: no heartbeat, no work days, no sign-ins", async ({ asRole }) => {
  const page = await asRole("founder");
  const seen = heartbeats(page);
  await page.goto("/dashboard");
  await page.mouse.move(100, 100);
  await page.mouse.move(300, 200);
  await page.waitForTimeout(1_500);
  expect(seen).toEqual([]);

  const id = await userId("founder");
  expect(await sql(`select 1 from "StaffDay" where "userId" = $1`, [id])).toHaveLength(0);
  expect(await sql(`select 1 from "AuthSession" where "userId" = $1`, [id])).toHaveLength(0);
});

test("a gateway write is audited with the real actor, and only founders can read the trail", async ({ asRole }) => {
  const cro = await asRole("cro");
  await cro.goto("/dashboard");
  const croId = await userId("cro");
  const token = await tokenOf(cro);
  const title = uniq("Pulse task");

  const created = await cro.request.post(`${E2E.apiUrl}/api/model/task/create`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { data: { title, assignedToId: croId, assignedById: croId } },
  });
  expect(created.ok()).toBeTruthy();
  const taskId = ((await created.json()) as { data: { id: string } }).data.id;

  const [row] = await sql<Record<string, unknown>>(
    `select * from "ActivityLog" where "entityType" = 'Task' and "entityId" = $1`,
    [taskId],
  );
  expect(row).toMatchObject({
    verb: "task.created",
    kind: "change",
    module: "tasks",
    performedById: croId,
    actorRole: "cro",
    source: "request",
  });
  expect(row?.requestId).toBeTruthy();
  expect((row?.changes as Record<string, unknown>).title).toEqual([null, title]);

  // The audit trail itself is founder-only, including through the gateway.
  const read = async (role: StaffRole) => {
    const page = await asRole(role);
    await page.goto("/dashboard");
    const res = await page.request.get(
      `${E2E.apiUrl}/api/model/activityLog/findMany?q=${encodeURIComponent(JSON.stringify({ where: { entityId: taskId } }))}`,
      { headers: { Authorization: `Bearer ${await tokenOf(page)}` } },
    );
    return ((await res.json()) as { data?: unknown[] }).data ?? [];
  };
  expect(await read("founder")).toHaveLength(1);
  expect(await read("ops_head")).toHaveLength(0);
  expect(await read("cro")).toHaveLength(0);
});

test("opening a client profile is recorded once as a view", async ({ asRole }) => {
  const [client] = await sql<{ id: string }>(`select id from "Client" where email = $1`, [sharedClient().email]);
  const page = await asRole("cro");
  const id = await userId("cro");
  const event = page.waitForRequest((r) => r.url().endsWith("/api/events"));
  await page.goto(`/clients/${client!.id}`);
  await event;
  await page.reload();
  await page.waitForTimeout(1_000);

  await expect
    .poll(async () =>
      (
        await sql(
          `select 1 from "ActivityLog" where verb = 'client.viewed' and "performedById" = $1 and "clientId" = $2`,
          [id, client!.id],
        )
      ).length,
    )
    .toBe(1);
});

test("a CSV export is recorded with the report name and row count", async ({ asRole }) => {
  const page = await asRole("ops_head");
  const id = await userId("ops_head");
  await page.goto("/reports");
  const download = page.waitForEvent("download");
  const event = page.waitForRequest((r) => r.url().endsWith("/api/events"));
  await page.getByRole("button", { name: "CSV" }).first().click();
  const filename = (await download).suggestedFilename();
  await event;

  await expect
    .poll(async () => {
      const [row] = await sql<{ meta: { report: string; rows: number } }>(
        `select meta from "ActivityLog" where verb = 'report.exported' and kind = 'export' and "performedById" = $1 and "entityId" = $2`,
        [id, filename],
      );
      return row?.meta.report;
    })
    .toBe(filename);
});

test("a staff sign-in is recorded once per auth session, with the device", async ({ asRole }) => {
  const page = await asRole("coach");
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  const id = await userId("coach");
  await expect
    .poll(async () => (await sql(`select 1 from "AuthSession" where "userId" = $1`, [id])).length)
    .toBeGreaterThan(0);
  const signIns = await sql<{ meta: { userAgent: string | null } }>(
    `select meta from "ActivityLog" where verb = 'auth.signed_in' and "performedById" = $1`,
    [id],
  );
  const sessions = await sql(`select 1 from "AuthSession" where "userId" = $1`, [id]);
  expect(signIns).toHaveLength(sessions.length);
  expect(signIns[0]?.meta.userAgent).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Founder UI (phases 3-4)
// ---------------------------------------------------------------------------

test("only founders see Team Pulse: nav, pages and API", async ({ asRole }) => {
  const founder = await asRole("founder");
  await founder.goto("/dashboard");
  await expect(founder.getByRole("link", { name: "Team Pulse" })).toBeVisible();

  for (const role of ["ops_head", "cro"] as const) {
    const page = await asRole(role);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Team Pulse" })).toHaveCount(0);
    await page.goto("/team-pulse");
    await expect(page.getByText("You don't have access to this page.")).toBeVisible();

    const token = await tokenOf(page);
    for (const path of ["/api/pulse/day", "/api/pulse/period", "/api/pulse/feed", `/api/pulse/staff/${await userId("cro")}`]) {
      const res = await page.request.get(`${E2E.apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status(), `${role} ${path}`).toBe(403);
    }
  }
  const anon = await founder.request.get(`${E2E.apiUrl}/api/pulse/day`);
  expect(anon.status()).toBe(401);
});

test("the founder follows a staff member's action from the overview to their activity log", async ({ asRole }) => {
  // A deterministic action for the CRO, through the real gateway.
  const cro = await asRole("cro");
  await cro.goto("/dashboard");
  const croId = await userId("cro");
  const title = uniq("Pulse UI task");
  const created = await cro.request.post(`${E2E.apiUrl}/api/model/task/create`, {
    headers: { Authorization: `Bearer ${await tokenOf(cro)}` },
    data: { data: { title, assignedToId: croId, assignedById: croId } },
  });
  expect(created.ok()).toBeTruthy();

  const page = await asRole("founder");
  await page.goto("/team-pulse");
  await expect(page.getByRole("heading", { name: "Team Pulse", exact: true })).toBeVisible();
  await expect(page.getByText("Team timeline")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(PERSONAS.cro.name) }).first().click();

  await expect(page.getByRole("heading", { name: PERSONAS.cro.name })).toBeVisible();
  await expect(page.getByText("Follow-ups completed").first()).toBeVisible(); // CRO outputs
  await expect(page.getByText("Created a task").first()).toBeVisible();

  // The same entry is in the team-wide feed, attributed to the CRO.
  await page.goto("/team-pulse/activity");
  await page.getByRole("textbox", { name: "Search activity" }).fill("task");
  await expect(page.getByText(`${PERSONAS.cro.name} ·`).first()).toBeVisible();
});

test("the client History tab is founder-only", async ({ asRole }) => {
  const [client] = await sql<{ id: string }>(`select id from "Client" where email = $1`, [sharedClient().email]);
  const founder = await asRole("founder");
  await founder.goto(`/clients/${client!.id}`);
  await founder.getByRole("button", { name: "History", exact: true }).click();
  await expect(founder.getByText(/\d+ entr(y|ies)/).first()).toBeVisible();

  const cro = await asRole("cro");
  await cro.goto(`/clients/${client!.id}`);
  await expect(cro.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
  await expect(cro.getByRole("button", { name: "History", exact: true })).toHaveCount(0);
});

test("the founder exports a staff report as CSV and as a printable page, and the export is audited", async ({ asRole }) => {
  const page = await asRole("founder");
  const croId = await userId("cro");
  const founderId = await userId("founder");
  await page.goto(`/team-pulse/staff/${croId}`);
  await expect(page.getByRole("heading", { name: PERSONAS.cro.name })).toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export report" });
  const from = await dialog.locator('input[type="date"]').nth(0).inputValue();
  const to = await dialog.locator('input[type="date"]').nth(1).inputValue();
  await dialog.getByLabel("Hide client names (show initials)").check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toBe(`team-pulse-carla-cro-${from}-to-${to}.csv`);

  // The printable report (opened without auto-print) renders summary, days and log.
  await page.goto(`/team-pulse/staff/${croId}/report?from=${from}&to=${to}&hideClients=1`);
  await expect(page.getByText("GTB OS · Team Pulse report")).toBeVisible();
  await expect(page.getByRole("heading", { name: PERSONAS.cro.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Day by day" })).toBeVisible();
  await expect(page.getByText("Client names shown as initials")).toBeVisible();

  await expect
    .poll(async () =>
      (
        await sql(
          `select 1 from "ActivityLog" where verb = 'report.exported' and kind = 'export' and "performedById" = $1 and "entityId" = $2`,
          [founderId, croId],
        )
      ).length,
    )
    .toBeGreaterThanOrEqual(2);
});
