/**
 * Styling Blueprint + stylist chat, end to end (STYLING_BLUEPRINT.md).
 *
 * Owns its own Groom To Be client (seeded below, with Stella as stylist and
 * Carla as CRO) so publishing never touches the shared journey client's
 * styling checklist. The story, in order:
 *   client sends 5 photos -> stylist asks for a retake -> client retakes ->
 *   stylist fills every section and previews -> publishes (PDF created) ->
 *   client sees the published Blueprint, ticks an essential -> later draft
 *   edits stay invisible until republished -> chat both ways, with an
 *   attachment -> the 12-hour unread email job runs once and fails silently
 *   (no SMTP in e2e) -> CRO and Ops Head get read-only views.
 */
import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { test, expect, E2E_DIR } from "../../fixtures/test.js";
import { e2ePool } from "../../helpers/db.js";
import { E2E } from "../../helpers/env.js";
import { PERSONAS } from "../../helpers/roles.js";
import { createAuthUser } from "../../helpers/supabaseAdmin.js";
import { field, pdfFile, pngFile, uniq } from "../../helpers/ui.js";
import { buildStorageState } from "../../setup/bootstrap.js";

test.describe.configure({ mode: "serial" });

const clientName = uniq("Blueprint Groom");
const firstName = clientName.split(" ")[0]!;
const clientEmail = `blueprint-${Date.now().toString(36)}@e2e.gtb.test`;
const clientId = crypto.randomUUID();
const statePath = path.join(E2E_DIR, ".auth", `blueprint-client-${clientId}.json`);

const tag = uniq("Clean");
const description = "A timeless style that looks great on your big day.";
const productName = uniq("Brown loafers");
const essential = uniq("Lint roller");
const clientQuestion = uniq("Can I wear the loafers with the sherwani?");
const stylistReply = uniq("Yes, in tan. Sending a reference.");

async function clientPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: statePath });
  return context.newPage();
}

async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = e2ePool();
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

test.beforeAll(async () => {
  await createAuthUser(clientEmail);
  const userId = crypto.randomUUID();
  await query(
    `insert into "User" (id, email, name, role, "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, 'client', true, now(), now())`,
    [userId, clientEmail, clientName],
  );
  await query(
    `insert into "Client" (id, "clientCode", name, phone, email, type, "weddingDate", city, status, "leadPhase", "userId", "createdAt", "updatedAt")
     values ($1, $2, $3, '9000000000', $4, 'groom', now() + interval '120 days', 'Bengaluru', 'active', 'payment_submitted', $5, now(), now())`,
    [clientId, `GTB${Math.floor(1000 + Math.random() * 8999)}`, clientName, clientEmail, userId],
  );
  for (const role of ["styling_consultant", "cro"] as const) {
    await query(
      `insert into "Assignment" (id, "clientId", "staffId", role, "isActive", "assignedAt")
       select gen_random_uuid(), $1, u.id, $2::"AssignmentRole", true, now() from "User" u where u.email = $3`,
      [clientId, role, PERSONAS[role].email],
    );
  }
  // A styling-day operation, so publishing can tick "Styling guide delivered".
  await query(
    `insert into "StylingOperation" (id, "clientId", "stylistId", status, "createdAt", "updatedAt")
     select gen_random_uuid(), $1, u.id, 'upcoming', now(), now() from "User" u where u.email = $2`,
    [clientId, PERSONAS.styling_consultant.email],
  );
  fs.writeFileSync(statePath, JSON.stringify(await buildStorageState(clientEmail), null, 2));
});

test.afterAll(() => {
  fs.rmSync(statePath, { force: true });
});

test("client sends the five guided photos", async ({ browser }) => {
  const page = await clientPage(browser);
  await page.goto("/portal");
  await page.getByRole("link", { name: "Send your styling photos" }).click();
  await expect(page).toHaveURL(/\/portal\/styling/);
  await expect(page.getByRole("heading", { name: "Your Styling Blueprint" })).toBeVisible();

  const submit = page.getByRole("button", { name: /more photos? to submit/ });
  await expect(submit).toBeDisabled();
  // Five required slots, in order, each with its own hidden picker.
  for (let i = 0; i < 5; i++) {
    await page
      .locator('input[type="file"]')
      .nth(i)
      .setInputFiles(pngFile(`slot-${i}.png`));
    await expect(page.getByText(`${i + 1} of 5`)).toBeVisible();
  }
  await page.getByRole("button", { name: "Submit photos" }).click();
  await expect(page.getByText(/is preparing your Blueprint/)).toBeVisible();
  await expect(page.getByText(/Expected by/)).toBeVisible();
  await page.context().close();
});

test("stylist sees it in the queue and asks for a retake", async ({ asRole }) => {
  const page = await asRole("styling_consultant");
  await page.goto("/styling-operations");
  const row = page.getByRole("row").filter({ hasText: clientName });
  await expect(row).toContainText("Under Review");
  await row.getByRole("link", { name: clientName }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}\\?tab=styling`));

  // Photo order: front, left side, right side, back of head, full body.
  await page.getByRole("button", { name: "Retake", exact: true }).nth(3).click();
  const dialog = page.getByRole("dialog", { name: "Ask for a new back of head photo" });
  await field(dialog, "What should the client change?").fill(
    "A little dark. Retake near a window.",
  );
  await dialog.getByRole("button", { name: "Request retake" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Retake Requested").first()).toBeVisible();
});

test("client retakes the flagged photo and it goes back to review", async ({ browser }) => {
  const page = await clientPage(browser);
  await page.goto("/portal/styling");
  await expect(page.getByText("Retake requested").first()).toBeVisible();
  await expect(page.getByText("A little dark. Retake near a window.")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(pngFile("back-retake.png"));
  await expect(page.getByText(/is preparing your Blueprint/)).toBeVisible();
  await page.context().close();
});

test("stylist builds every kind of section and previews the client view", async ({ asRole }) => {
  const page = await asRole("styling_consultant");
  await page.goto(`/clients/${clientId}?tab=styling`);
  await expect(page.getByText("Under Review").first()).toBeVisible();

  const open = async (name: string) => {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const close = async (dialog: ReturnType<Page["getByRole"]>) => {
    // Header X and footer button are both "Close"; use the footer one.
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(dialog).not.toBeVisible();
  };

  // Style Profile, marked done.
  let d = await open("Style Profile");
  await field(d, "Face shape").fill("Oval");
  await field(d, "Hair type").fill("Thick, dense");
  await d.getByRole("button", { name: "Save draft" }).click();
  await expect(d.getByText("Saved as draft")).toBeVisible();
  await d.getByLabel("Mark section done").click();
  await expect(d.getByLabel("Mark section done")).toBeChecked();
  await close(d);
  await expect(page.getByText("1 of 10 sections done")).toBeVisible();

  // Style Direction.
  d = await open("Style Direction");
  await field(d, "Style tags").fill(tag);
  await field(d, "Style tags").press("Enter");
  await field(d, "Description").fill(description);
  await d.getByRole("button", { name: "Save draft" }).click();
  await expect(d.getByText("Saved as draft")).toBeVisible();
  await close(d);

  // Best Looks, with an edited image uploaded through the picker.
  d = await open("Best Looks");
  await d.getByRole("button", { name: "Add look" }).click();
  await d.getByRole("button", { name: "Choose Look image" }).click();
  const picker = page.getByRole("dialog", { name: "Choose look image" });
  await picker.locator('input[type="file"]').setInputFiles(pngFile("look-edit.png"));
  await expect(picker).not.toBeVisible();
  await field(d, "Title").fill("Look 01 · Ceremony");
  await field(d, "Occasion").fill("Big day");
  await field(d, "Outfit").fill("Ivory sherwani");
  await d.getByRole("button", { name: "Save look" }).click();
  await expect(d.getByText("Look 01 · Ceremony")).toBeVisible();
  await close(d);

  // Hair & Beard brief.
  d = await open("Hair & Beard");
  await d.getByLabel("Brief line 1").fill("Sides clean, not too tight.");
  await d.getByRole("button", { name: "Save draft" }).click();
  await expect(d.getByText("Saved as draft")).toBeVisible();
  await close(d);

  // Outfit Colours.
  d = await open("Outfit Colours");
  await d.getByRole("button", { name: "Add colour combination" }).click();
  await field(d, "Label").fill("Ivory and gold");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d.getByText("Ivory and gold")).toBeVisible();
  await close(d);

  // Shopping List with a shop link.
  d = await open("Shopping List");
  await d.getByRole("button", { name: "Add product" }).click();
  await field(d, "Product").fill(productName);
  await field(d, "Price range").fill("₹2,000 to ₹4,000");
  await field(d, "Shop link").fill("https://example.com/loafers");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d.getByText(productName)).toBeVisible();
  await close(d);

  // Big Day Essentials.
  d = await open("Big Day Essentials");
  await d.getByLabel("New essential").fill(essential);
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await expect(d.getByText(essential)).toBeVisible();
  await close(d);

  // Preview renders the exact client component over the draft.
  await page.getByRole("button", { name: "Preview client view" }).click();
  const preview = page.getByRole("dialog", { name: "Preview client view" });
  await expect(preview.getByRole("heading", { name: "Your Style Blueprint" })).toBeVisible();
  await expect(preview.getByText(tag)).toBeVisible();
  await expect(preview.getByText(description)).toBeVisible();
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(preview).not.toBeVisible();
});

test("client can't see the draft before it is published", async ({ browser }) => {
  const page = await clientPage(browser);
  await page.goto("/portal/styling");
  await expect(page.getByText(/is preparing your Blueprint/)).toBeVisible();
  await expect(page.getByText(tag)).not.toBeVisible();
  await page.context().close();
});

test("stylist publishes; the PDF is generated and the checklist is ticked", async ({ asRole }) => {
  const page = await asRole("styling_consultant");
  await page.goto(`/clients/${clientId}?tab=styling`);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Publish ${firstName}'s Styling Blueprint?` });
  // Footwear, eyewear and outfit recommendations were left empty on purpose.
  await expect(dialog.getByText(/sections are empty/)).toBeVisible();
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  const notice = page.getByRole("status").filter({ hasText: "Version 1 published" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("has been notified");
  await expect(notice).not.toContainText("couldn't be created");
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();

  const [version] = await query<{ version: number; pdfDocumentId: string | null }>(
    `select v.version, v."pdfDocumentId" from "StylingBlueprintVersion" v
     join "StylingBlueprint" b on b.id = v."blueprintId" where b."clientId" = $1`,
    [clientId],
  );
  expect(version?.version).toBe(1);
  expect(version?.pdfDocumentId).toBeTruthy();
  const [pdf] = await query<{ type: string; fileSize: number }>(
    `select type, "fileSize" from "Document" where id = $1`,
    [version!.pdfDocumentId],
  );
  expect(pdf?.type).toBe("styling_guide");
  expect(pdf?.fileSize).toBeGreaterThan(1000);

  const [op] = await query<{ guideDelivered: boolean; status: string }>(
    `select "guideDelivered", status from "StylingOperation" where "clientId" = $1`,
    [clientId],
  );
  expect(op?.guideDelivered).toBe(true);
  expect(op?.status).toBe("in_progress");
});

test("client sees the published Blueprint and ticks an essential", async ({ browser }) => {
  const page = await clientPage(browser);
  await page.goto("/portal/styling");
  await expect(page.getByRole("heading", { name: "Your Style Blueprint" })).toBeVisible();
  await expect(page.getByText(tag)).toBeVisible();
  await expect(page.getByRole("button", { name: /Download Blueprint PDF/ })).toBeVisible();

  await page.getByRole("button", { name: /^Hair & Grooming/ }).click();
  await expect(page.getByText("Sides clean, not too tight.")).toBeVisible();
  await page.getByRole("button", { name: "Back to your Blueprint" }).click();

  await page.getByRole("button", { name: /^My Looks/ }).click();
  await expect(page.getByText("Look 01 · Ceremony")).toBeVisible();
  await expect(page.getByText("Ivory sherwani")).toBeVisible();
  await page.getByRole("button", { name: "Back to your Blueprint" }).click();

  await page.getByRole("button", { name: /^Shopping List/ }).click();
  await expect(page.getByText(productName)).toBeVisible();
  await expect(page.getByRole("link", { name: "View" })).toHaveAttribute(
    "href",
    "https://example.com/loafers",
  );
  const box = page.getByLabel(essential);
  // The tick is optimistic; wait for the server to store it before reloading.
  const saved = page.waitForResponse((r) => r.url().includes("/api/styling/essentials") && r.ok());
  await box.click();
  await expect(box).toBeChecked();
  await saved;

  // The tick is stored server-side.
  await page.reload();
  await page.getByRole("button", { name: /^Shopping List/ }).click();
  await expect(page.getByLabel(essential)).toBeChecked();
  await page.context().close();
});

test("later edits stay a draft until the stylist republishes", async ({ asRole, browser }) => {
  const page = await asRole("styling_consultant");
  await page.goto(`/clients/${clientId}?tab=styling`);
  await page.getByRole("button", { name: /^Style Direction/ }).click();
  const d = page.getByRole("dialog", { name: "Style Direction", exact: true });
  await field(d, "Description").fill("A brand new draft line.");
  await d.getByRole("button", { name: "Save draft" }).click();
  await expect(d.getByText("Saved as draft")).toBeVisible();
  await d.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByText("Draft changes")).toBeVisible();

  const client = await clientPage(browser);
  await client.goto("/portal/styling");
  await expect(client.getByText(description)).toBeVisible();
  await expect(client.getByText("A brand new draft line.")).not.toBeVisible();
  await client.context().close();
});

test("client and stylist chat, with an attachment", async ({ asRole, browser }) => {
  const client = await clientPage(browser);
  await client.goto("/portal/styling");
  await client.getByRole("button", { name: /^Ask Stella/ }).click();
  await expect(client).toHaveURL(/chat=1/);
  await expect(
    client.getByText("Your GTB team can see this conversation", { exact: false }),
  ).toBeVisible();
  await client.getByLabel("Message").fill(clientQuestion);
  await client.getByLabel("Message").press("Enter");
  await expect(client.getByText(clientQuestion)).toBeVisible();

  const stylist = await asRole("styling_consultant");
  await stylist.goto("/messages");
  const row = stylist.getByRole("link").filter({ hasText: clientName });
  await expect(row).toContainText(clientQuestion);
  await row.click();
  const thread = stylist.getByRole("region", { name: "Messages" });
  await expect(thread.getByText(clientQuestion)).toBeVisible();
  await thread.locator('input[type="file"]').setInputFiles(pdfFile("tan-loafers.pdf"));
  await thread.getByLabel("Message").fill(stylistReply);
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread.getByText(stylistReply)).toBeVisible();
  await expect(thread.getByRole("link", { name: "tan-loafers.pdf" })).toBeVisible();

  // The client's open chat polls and shows the reply with its attachment.
  await expect(client.getByText(stylistReply)).toBeVisible({ timeout: 20_000 });
  await expect(client.getByRole("link", { name: "tan-loafers.pdf" })).toBeVisible();
  await client.context().close();
});

test("unread messages are emailed once after 12 hours, failing silently without SMTP", async ({
  request,
}) => {
  // Age the stylist's reply past the 12-hour mark and make sure it counts as unread.
  await query(
    `update "Message" set "createdAt" = now() - interval '13 hours', "emailAlertedAt" = null where body = $1`,
    [stylistReply],
  );
  await query(
    `update "ConversationRead" set "lastReadAt" = now() - interval '14 hours'
     where "userId" = (select "userId" from "Client" where id = $1)`,
    [clientId],
  );

  const denied = await request.get(`${E2E.apiUrl}/api/cron/hourly`);
  expect(denied.status()).toBe(403);

  const run = await request.get(`${E2E.apiUrl}/api/cron/hourly`, {
    headers: { "x-cron-secret": E2E.cronSecret },
  });
  expect(run.ok()).toBe(true);
  const body = (await run.json()) as {
    report: { chatEmailsSent: number; chatEmailsFailed: number };
  };
  // e2e has no SMTP, so the attempt "fails" and is recorded without retrying.
  expect(body.report.chatEmailsSent + body.report.chatEmailsFailed).toBeGreaterThanOrEqual(1);
  const [msg] = await query<{ emailAlertedAt: Date | null }>(
    `select "emailAlertedAt" from "Message" where body = $1`,
    [stylistReply],
  );
  expect(msg?.emailAlertedAt).toBeTruthy();

  // A second run doesn't chase the same message again.
  const again = await request.get(`${E2E.apiUrl}/api/cron/hourly`, {
    headers: { "x-cron-secret": E2E.cronSecret },
  });
  const before = msg!.emailAlertedAt!.toISOString();
  expect(again.ok()).toBe(true);
  const [after] = await query<{ emailAlertedAt: Date }>(
    `select "emailAlertedAt" from "Message" where body = $1`,
    [stylistReply],
  );
  expect(after!.emailAlertedAt.toISOString()).toBe(before);
});

test("the CRO gets a read-only Blueprint and no chat; Ops Head reads chat but can't post", async ({
  asRole,
}) => {
  const cro = await asRole("cro");
  await cro.goto(`/clients/${clientId}?tab=styling`);
  await expect(cro.getByText("Read-only")).toBeVisible();
  await expect(cro.getByRole("button", { name: /^Publish/ })).not.toBeVisible();
  await expect(cro.getByRole("region", { name: "Messages" })).not.toBeVisible();

  const ops = await asRole("ops_head");
  await ops.goto(`/clients/${clientId}?tab=styling`);
  const thread = ops.getByRole("region", { name: "Messages" });
  await expect(thread.getByText(clientQuestion)).toBeVisible();
  await expect(
    thread.getByText("Founders and Ops Heads can read conversations but not post."),
  ).toBeVisible();
  await expect(thread.getByLabel("Message")).not.toBeVisible();
});
