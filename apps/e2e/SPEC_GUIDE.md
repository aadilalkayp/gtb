# Writing GTB OS E2E specs

Read this before adding or editing anything under `specs/`.

## Environment model

- `playwright.config.ts` boots everything: a dedicated Supabase stack
  (`gtb_e2e`, ports 545xx), the API on :3105, the web app on :5185. Dev data
  (`supabase start` on 544xx, `pnpm dev`) is never touched.
- Every run starts from a wiped + reseeded database (see `setup/bootstrap.ts`):
  one staff persona per role (`helpers/roles.ts`, password in `helpers/env.ts`),
  seeded plans ("GTB (1 Month)" etc.), lead sources, expense categories, and a
  ₹500 per-session rate for each consultant persona.
- Projects run in order: `auth-check` → `journey` → `modules`. The journey
  project creates one **active client** and saves it (plus a signed-in portal
  session) for module specs via `sharedClient()`.

## Patterns

```ts
import { test, expect, pageAs, portalPage, sharedClient } from "../../fixtures/test.js";
import { field, modal, uniq, pngFile } from "../../helpers/ui.js";

test("ops head approves an expense", async ({ asRole }) => {
  const page = await asRole("ops_head");       // signed-in page, auto-closed
  await page.goto("/expenses");
  await field(page, "Amount (₹)").fill("1200"); // <Field label="…"> lookup
  …
});
```

- `field(scope, label)` — most form controls. The app's `<Field>` rarely sets
  `htmlFor`, so `getByLabel` usually does NOT work (exceptions: auth pages and
  `/assignments`, where controls sit inside their `<label>`).
- Modals: `page.getByRole("dialog", { name: "<title>" })` (Modal sets
  `aria-label` from its title). Scope all clicks inside the dialog.
- File uploads: hidden inputs — `locator('input[type="file"]').setInputFiles(pngFile())`.
- Names: always `uniq("Lead")` so parallel runs never collide.

## Rules

1. **Verify selectors against the page source** (`apps/web/src/pages/…`)
   before using them. Button/label text in specs must match the code exactly.
2. **Own your data.** Create what you mutate. The shared journey client may be
   used for *additive* flows (complete a session, create a fitness plan, log
   weight) but never destructive ones (cancel, hold, password change). Specs
   that approve/reject/delete must target rows they created, matched by their
   unique name.
3. **Money flows live in one file** (`payments.spec.ts`) to avoid races on the
   shared client's ledger.
4. **Session completion:** `consultations.spec.ts` consumes the shared
   client's *skincare* sessions; `portal.spec.ts` consumes *fitness* sessions.
5. One module area per file, `test.describe.configure({ mode: "serial" })`
   when later tests depend on earlier ones; files run in parallel with each
   other.
6. No `data-testid` unless a control is genuinely unreachable by role/text —
   prefer fixing accessibility in the component (like Modal's `aria-label`).
7. Assert outcomes, not implementation: visible text, URL, row state. For
   cross-role effects, open a second persona page in the same test.
