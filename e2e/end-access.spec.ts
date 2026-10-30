import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * "End this client's access" on /admin/reporting — the screens, both widths.
 *
 * Written for Dom's look before it ships, and it also asserts the two things
 * a photograph cannot: that the control is retainer-only, and that the first
 * press is a question rather than the act. The database half of that is in
 * `report-schema.test.mjs` and the action half in `end-access.test.mjs`; this
 * is the same promise through the real screen.
 *
 * Run it on its own:
 *   npx playwright test end-access.spec.ts
 */

requireLocalStack();

const OUT = "docs/nina-review/screens-end-access";
const RETAINER = "Northwind Studio";
const SELF_SERVE = "Ruth Test Coaching";

async function shot(page: Page, name: string, w: "phone" | "desktop") {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
}

/**
 * Give the client their access back.
 *
 * Straight to the database, because this spec ends a client's access twice —
 * once per project width — and twice more every time it is re-run. Without
 * this, the first run leaves the seed with no client grant to end and every
 * run after it waits sixty seconds for a disclosure that is correctly absent.
 * Which is the feature working; it is the fixture that has to be put back.
 */
async function giveAccessBack() {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`
    update public.report_access a
       set revoked_at = null, revoked_by = null
      from public.report_workspaces w
     where w.id = a.workspace_id
       and w.business_name = '${RETAINER}'
       and a.role = 'client';
  `);
}

/** The card for one business, so a locator cannot drift onto another. */
function cardFor(page: Page, business: string) {
  return page.locator(".rounded-card").filter({ hasText: business }).first();
}

test.describe("ending a client's access", () => {
  // Both ends: clean whatever a previous run left, and leave it clean for the
  // next project and the next run.
  test.beforeAll(giveAccessBack);
  test.afterAll(giveAccessBack);

  test.beforeEach(async ({ page }) => {
    await signIn(page, "nina");
    await page.goto("/admin/reporting");
    await expect(page.getByRole("heading", { name: "Reporting clients" })).toBeVisible();
  });

  test("the card, before anything is opened", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";
    await expect(cardFor(page, RETAINER)).toBeVisible();
    await shot(page, "01-reporting-clients", w);
  });

  test("the disclosure, and what it says before you press", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";
    const card = cardFor(page, RETAINER);

    await card.getByText("End this client’s access").click();
    await expect(
      card.getByText(/Their login stops opening this report/),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "End their access" })).toBeVisible();
    await shot(page, "02-disclosure-open", w);
  });

  test("the first press is a question, not the act", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";
    const card = cardFor(page, RETAINER);

    await card.getByText("End this client’s access").click();
    await card.getByRole("button", { name: "End their access" }).click();

    // The warning names the person and the business, because on a screen
    // listing every client the button alone does not say whose access.
    await expect(card.getByText(/Bella Test/)).toBeVisible();
    await expect(card.getByText(/no undo on this screen/)).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Yes, end their access" }),
    ).toBeVisible();
    await shot(page, "03-confirm-asked", w);

    // And it really has not happened: the client is still named on the card,
    // and no "Access ended" line has appeared.
    await expect(card.getByText("Access ended")).toHaveCount(0);
  });

  test("a self-serve workspace is not offered it at all", async ({ page }) => {
    const card = cardFor(page, SELF_SERVE);
    await expect(card).toBeVisible();
    await expect(card.getByText("End this client’s access")).toHaveCount(0);
    // The route it does have, so this is a redirection rather than a dead end.
    await expect(card.getByText("Edit details")).toBeVisible();
  });

  // Last, because it changes the seeded state the tests above read. Playwright
  // runs a file's tests in order with `workers: 1`.
  test("the second press ends it, and the card says so", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";
    const card = cardFor(page, RETAINER);

    await card.getByText("End this client’s access").click();
    await card.getByRole("button", { name: "End their access" }).click();
    await card.getByRole("button", { name: "Yes, end their access" }).click();

    // The card's own line, not the form's notice. Ending access removes the
    // client grant the disclosure is rendered from, so the form unmounts on
    // the revalidate and takes its message with it — the changed card IS the
    // confirmation, which is the same way a saved figure reports itself here.
    await expect(card.getByText("Access ended")).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/Bella Test on \d{4}-\d{2}-\d{2}/)).toBeVisible();
    await expect(card.getByText("End this client’s access")).toHaveCount(0);

    // Still every month it had: this took access away, not the work.
    await expect(card.getByText("Months started")).toBeVisible();
    await shot(page, "04-access-ended", w);

    // And what the client reads. In the same test because `afterAll` puts the
    // grant back, so the ended state does not survive into another one.
    await signIn(page, "client");
    await expect(
      page.getByRole("heading", { name: /Your access has ended/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/every figure in your reports is still there/),
    ).toBeVisible();
    // "ended on", not "ran until" — the latter is the Chiarezza sentence, for
    // a window that reached a date set when they were invited.
    await expect(page.getByText(/Your reporting access ended on/)).toBeVisible();
    await expect(page.getByText(/ran until/)).toHaveCount(0);
    // Rule 8: the only address a client is ever given.
    await expect(
      page.getByRole("link", { name: "contact@allegrobusinessservices.co.uk" }),
    ).toBeVisible();
    await shot(page, "05-client-told", w);

    // The same sign-in, but carrying the `next` a stale tab leaves behind —
    // the 5 October shape, and the only one where the landing decision is
    // actually consulted. A bare sign-in goes to "/" and the root page works
    // it out from getReportUser(); this one does not reach the root page at
    // all, so it is landingForSession that has to refuse.
    await page.context().clearCookies();
    await page.goto("/login?next=%2Freporting");
    await page.getByLabel(/email/i).fill("client@aos.test");
    await page.getByLabel(/password/i).fill("test-password-client");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(
      page.getByRole("heading", { name: /Your access has ended/i }),
    ).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe("/no-access");
    await shot(page, "06-client-told-stale-link", w);
  });

  // Straight after, because it needs the ended state the test above leaves.
  // Playwright runs a file's tests in order with `workers: 1`.
  test("and giving it back, from the same card", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";
    const card = cardFor(page, RETAINER);

    // The two controls are never both up: this one is here only because the
    // client grant is ended, and ending is offered only while it is live.
    await expect(card.getByText("End this client’s access")).toHaveCount(0);

    await card.getByText("Restore Bella Test’s access").click();
    await expect(card.getByText(/Their login opens this report again/)).toBeVisible();
    await shot(page, "07-restore-disclosure", w);

    await card.getByRole("button", { name: "Restore their access" }).click();
    await expect(card.getByText(/emailed again when one is published/)).toBeVisible();
    await shot(page, "08-restore-confirm-asked", w);
    // Still ended until the second press.
    await expect(card.getByText("Access ended")).toBeVisible();

    await card.getByRole("button", { name: "Yes, restore their access" }).click();

    // The card going back to naming them as the client is the confirmation,
    // the same way the ended line was.
    await expect(card.getByText("Access ended")).toHaveCount(0, { timeout: 15_000 });
    await expect(card.getByText("End this client’s access")).toBeVisible();
    await shot(page, "09-access-restored", w);

    // And they are really back in, on the months they already had.
    await signIn(page, "client");
    await expect(
      page.getByRole("heading", { name: /Your access has ended/i }),
    ).toHaveCount(0);
    await expect(page.getByText(RETAINER)).toBeVisible({ timeout: 20_000 });
    await shot(page, "10-client-back-in", w);
  });
});
