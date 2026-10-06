/**
 * Founder-only permanent deletion of a fresh lead (api/clients/delete). Only a
 * lead with no plan, no delivered work and no portal sign-in qualifies; the
 * deletion removes what the lead owns, keeps linked tasks (unlinked), and
 * leaves a `client.deleted` audit event carrying a snapshot of the lead.
 *
 * Every lead here is created by this file. The shared active client is only
 * used to check that a non-lead is refused (read-only). The funnel test runs
 * one scan through the API (the scan route allows 6 per hour per IP; scan.spec
 * uses one).
 */
import type { Page } from "@playwright/test";
import { test, expect, sharedClient } from "../../fixtures/test.js";
import { e2ePool } from "../../helpers/db.js";
import { E2E } from "../../helpers/env.js";
import { PERSONAS, type StaffRole } from "../../helpers/roles.js";
import { supabaseAdmin } from "../../helpers/supabaseAdmin.js";
import { field, pngFile, uniq } from "../../helpers/ui.js";

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

/** A CRO creates a lead through the gateway, invites it, and links a task. */
async function freshLead(cro: Page, name: string): Promise<{ id: string; taskId: string }> {
  await cro.goto("/dashboard");
  const croId = await userId("cro");
  const headers = { Authorization: `Bearer ${await tokenOf(cro)}` };
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const created = await cro.request.post(`${E2E.apiUrl}/api/model/client/create`, {
    headers,
    data: {
      data: {
        clientCode: `DEL${tag.toUpperCase()}`,
        name,
        phone: `9${String(Date.now()).slice(-9)}`,
        email: `del.${tag}@e2e.gtb.test`,
        type: "groom",
        weddingDate: "2027-08-15T00:00:00.000Z",
        city: "Kochi",
        createdById: croId,
      },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const id = ((await created.json()) as { data: { id: string } }).data.id;

  // The invite provisions an (unused) portal User and the CRO assignment.
  const invited = await cro.request.post(`${E2E.apiUrl}/api/clients/invite`, { headers, data: { clientId: id } });
  expect(invited.ok(), await invited.text()).toBeTruthy();

  const task = await cro.request.post(`${E2E.apiUrl}/api/model/task/create`, {
    headers,
    data: { data: { title: uniq("Call lead"), assignedToId: croId, assignedById: croId, clientId: id } },
  });
  expect(task.ok(), await task.text()).toBeTruthy();
  const taskId = ((await task.json()) as { data: { id: string } }).data.id;
  return { id, taskId };
}

test("the founder permanently deletes a fresh lead, and the audit log keeps who it was", async ({ asRole }) => {
  const name = uniq("Junk Lead");
  const { id, taskId } = await freshLead(await asRole("cro"), name);
  const [before] = await sql<{ userId: string | null }>(`select "userId" from "Client" where id = $1`, [id]);
  expect(before?.userId).toBeTruthy();

  const founder = await asRole("founder");
  await founder.goto(`/clients/${id}`);
  await founder.getByRole("button", { name: "Delete lead" }).click();

  const dialog = founder.getByRole("dialog", { name: `Delete ${name}` });
  await expect(dialog.getByText("This removes the lead for good.")).toBeVisible();
  await expect(dialog.getByText(/1 staff assignment/)).toBeVisible();
  await expect(dialog.getByText("1 task stays, no longer linked to this lead.")).toBeVisible();

  // A reason is required.
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(dialog.getByText("Please give a reason.")).toBeVisible();

  await field(dialog, "Reason").fill("Test entry");
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(founder).toHaveURL(/\/clients$/);
  await expect(founder.getByRole("link", { name })).toHaveCount(0);

  expect(await sql(`select 1 from "Client" where id = $1`, [id])).toHaveLength(0);
  expect(await sql(`select 1 from "User" where id = $1`, [before!.userId])).toHaveLength(0);
  expect(await sql(`select 1 from "Assignment" where "clientId" = $1`, [id])).toHaveLength(0);
  const [task] = await sql<{ clientId: string | null }>(`select "clientId" from "Task" where id = $1`, [taskId]);
  expect(task).toEqual({ clientId: null });

  const [event] = await sql<{ performedById: string; summary: string; changes: Record<string, unknown> }>(
    `select "performedById", summary, changes from "ActivityLog" where verb = 'client.deleted' and "entityId" = $1`,
    [id],
  );
  expect(event?.performedById).toBe(await userId("founder"));
  expect(event?.summary).toContain(name);
  expect(event?.changes).toMatchObject({ name, reason: "Test entry", removed: { assignments: 1, portalAccount: 1 } });
});

test("a client past the lead stage can't be deleted", async ({ asRole }) => {
  const [shared] = await sql<{ id: string }>(`select id from "Client" where email = $1`, [sharedClient().email]);
  const founder = await asRole("founder");
  await founder.goto(`/clients/${shared!.id}`);
  await expect(founder.getByRole("heading", { name: sharedClient().name })).toBeVisible();
  await expect(founder.getByRole("button", { name: "Delete lead" })).toHaveCount(0);

  const headers = { Authorization: `Bearer ${await tokenOf(founder)}` };
  const preview = await founder.request.get(`${E2E.apiUrl}/api/clients/delete?clientId=${shared!.id}`, { headers });
  expect(preview.ok()).toBeTruthy();
  expect(await preview.json()).toMatchObject({ deletable: false, blockers: expect.arrayContaining(["not_a_lead", "has_plan"]) });

  const res = await founder.request.post(`${E2E.apiUrl}/api/clients/delete`, {
    headers,
    data: { clientId: shared!.id, reason: "should be refused" },
  });
  expect(res.status()).toBe(409);
  expect(await sql(`select 1 from "Client" where id = $1`, [shared!.id])).toHaveLength(1);
});

test("only the founder can delete a lead", async ({ asRole }) => {
  const name = uniq("Kept Lead");
  const { id } = await freshLead(await asRole("cro"), name);

  for (const role of ["ops_head", "cro"] as const) {
    const page = await asRole(role);
    await page.goto(`/clients/${id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete lead" })).toHaveCount(0);

    const headers = { Authorization: `Bearer ${await tokenOf(page)}` };
    const res = await page.request.post(`${E2E.apiUrl}/api/clients/delete`, {
      headers,
      data: { clientId: id, reason: "not allowed" },
    });
    expect(res.status(), role).toBe(403);
  }
  const founder = await asRole("founder");
  const anon = await founder.request.post(`${E2E.apiUrl}/api/clients/delete`, { data: { clientId: id, reason: "x" } });
  expect(anon.status()).toBe(401);
  expect(await sql(`select 1 from "Client" where id = $1`, [id])).toHaveLength(1);
});

test("deleting a readiness-scan lead removes the scan trail and its photos", async ({ asRole, request }) => {
  const email = `delscan.${Date.now().toString(36)}@e2e.gtb.test`;
  const started = await request.post(`${E2E.apiUrl}/api/scan/start`, {
    multipart: {
      file: pngFile("selfie.png"),
      fullBody: pngFile("full-body.png"),
      weddingDate: "2027-09-01",
      type: "groom",
    },
  });
  expect(started.ok(), await started.text()).toBeTruthy();
  const { scanId } = (await started.json()) as { scanId: string };
  const claimed = await request.post(`${E2E.apiUrl}/api/scan/claim`, {
    data: { scanId, name: uniq("Scan Lead"), email, phone: "+91 90000 11111", city: "Kochi" },
  });
  expect(claimed.ok(), await claimed.text()).toBeTruthy();

  const [lead] = await sql<{ id: string }>(`select id from "Client" where email = $1`, [email]);
  const photos = await sql<{ path: string }>(
    `select "photoPath" as path from "Scan" where id = $1 union all select path from "ScanPhoto" where "scanId" = $1`,
    [scanId],
  );
  expect(photos).toHaveLength(2);
  expect((await sql(`select 1 from "RoadmapItem" where "clientId" = $1`, [lead!.id])).length).toBeGreaterThan(0);

  const founder = await asRole("founder");
  await founder.goto("/dashboard");
  const res = await founder.request.post(`${E2E.apiUrl}/api/clients/delete`, {
    headers: { Authorization: `Bearer ${await tokenOf(founder)}` },
    data: { clientId: lead!.id, reason: "Spam scan" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect(((await res.json()) as { counts: { scans: number; assessment: number } }).counts).toMatchObject({
    scans: 1,
    assessment: 1,
  });

  expect(await sql(`select 1 from "Client" where id = $1`, [lead!.id])).toHaveLength(0);
  expect(await sql(`select 1 from "Scan" where id = $1`, [scanId])).toHaveLength(0);
  expect(await sql(`select 1 from "RoadmapItem" where "clientId" = $1`, [lead!.id])).toHaveLength(0);
  for (const { path } of photos) {
    const { error } = await supabaseAdmin.storage.from("scan-photos").download(path);
    expect(error, path).toBeTruthy();
  }
});
