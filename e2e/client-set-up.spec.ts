import { type Page } from "@playwright/test";
import { expect, test } from "./quiet.ts";
import { mkdirSync } from "node:fs";

import { capture, requireLocalStack, signIn } from "./helpers.ts";

/**
 * Setting a reporting client up without inviting them (Nina, 27 November).
 *
 * The database half is in `report-client-setup.test.mjs`. This is the half
 * no test below the screen can see: that the set-up form really does not
 * send anything, that the card says so, and that the nudge about nothing
 * being published is there to read before the invitation goes.
 *
 * **It invites nobody.** The second press would create a login and ask
 * Supabase to email a real address, and a browser suite is not a thing to
 * do that from — the local stack's auth would take it and the address in
 * the fixture is made up, but the habit is the problem. So this drives
 * the first press, which is the one that asks, and the action test owns
 * what the second one does.
 *
 * Run it on its own:
 *   npx playwright test client-set-up.spec.ts
 */

requireLocalStack();

const OUT = "docs/nina-review/screens-client-set-up";
const BUSINESS = "Nudge Test Co";
const CONTACT = "Pat Pending";
const EMAIL = "pat@nudgetest.invalid";
const CORRECTED = "corrected@nudgetest.invalid";

async function shot(page: Page, name: string, w: "phone" | "desktop") {
  mkdirSync(OUT, { recursive: true });
  await capture(page, `${OUT}/${name}-${w}.png`);
}

/**
 * Take the test client away again.
 *
 * This spec sets one up, so without this the second width's run finds a
 * business that already exists and the one after that finds two. Straight
 * to the database for the same reason `end-access.spec.ts` does it: the
 * fixture is not what is being tested.
 *
 * Nothing is deleted anywhere else in this product (rule 7) and this is
 * not an exception to it — a workspace created by a browser test is not a
 * client's record of anything.
 */
async function removeTestClient() {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  sql(`
    delete from public.report_access
      where workspace_id in (
        select id from public.report_workspaces where business_name = '${BUSINESS}');
    delete from public.report_workspaces where business_name = '${BUSINESS}';
  `);
}

/** The card for one business, so a locator cannot drift onto another. */
function cardFor(page: Page, business: string) {
  return page.locator(".rounded-card").filter({ hasText: business }).first();
}

test.describe("setting a client up before inviting them", () => {
  test.beforeAll(removeTestClient);
  test.afterAll(removeTestClient);

  test.beforeEach(async ({ page }) => {
    await signIn(page, "nina");
    await page.goto("/admin/reporting");
    await expect(page.getByRole("heading", { name: "Reporting clients" })).toBeVisible();
  });

  /**
   * **One test for the whole flow, deliberately.**
   *
   * It was four, each using the client the first one created, and that
   * is a shape this runner undoes: a failing test restarts the worker,
   * `beforeAll` runs again in the new one, and the three tests after it
   * then fail looking for a client the cleanup had just removed. Three
   * red tests, one cause, and none of the messages said so.
   */
  test("set up, not invited, and the press that asks first", async ({ page }, info) => {
    const w = info.project.name === "phone" ? "phone" : "desktop";

    // --- the form says it sends nothing, and sets one up ------------------
    const setUp = page.locator("form").filter({ hasText: "Set up client" }).first();
    await expect(setUp).toContainText("No email goes out and no login is created yet");
    await shot(page, "01-set-up-form", w);

    await setUp.getByLabel("Business name").fill(BUSINESS);
    await setUp.getByLabel("Contact name").fill(CONTACT);
    await setUp.getByLabel("Email address").fill(EMAIL);
    await setUp.getByLabel("First month with figures").fill("2026-08");
    await setUp.getByRole("button", { name: "Set up client" }).click();

    await expect(page.getByText(/set up and ready for figures/)).toBeVisible();
    await shot(page, "02-set-up-done", w);

    // --- the card says what has and has not happened ----------------------
    const card = cardFor(page, BUSINESS);
    await expect(card).toContainText("Not invited yet");
    // Nina's nudge. Nothing has been published for this one, which is the
    // state a client should not be invited into.
    await expect(card).toContainText("Nothing published yet");
    await expect(card).toContainText("being prepared");
    // And the contact is named on the card even though there is no grant
    // to read it from yet.
    await expect(card).toContainText(CONTACT);
    await shot(page, "03-not-invited-card", w);

    // --- a mistyped address is fixable before it is sent ------------------
    // Which is why the pending contact is in Edit details: an address
    // typed wrong at set-up could otherwise only be corrected in SQL, and
    // the invitation would go to it.
    await card.locator("summary").filter({ hasText: "Edit details" }).click();
    const edit = card.locator("form").filter({ hasText: "Email address for the invitation" });
    await expect(edit.getByLabel("Email address for the invitation")).toHaveValue(EMAIL);
    await edit.getByLabel("Email address for the invitation").fill(CORRECTED);
    await edit.getByRole("button", { name: "Save details" }).click();
    await expect(edit).toContainText("updated");

    // --- the first press asks before it sends -----------------------------
    await page.reload();
    const again = cardFor(page, BUSINESS);
    // The summary, not the submit button: both say "Send invitation",
    // which is right on the screen and ambiguous to a locator.
    await again.locator("summary").filter({ hasText: "Send invitation" }).click();

    const send = again.locator("form").filter({ hasText: "gets a login that opens" });
    await expect(send).toContainText(`${CONTACT} at ${CORRECTED}`);
    await shot(page, "04-send-disclosure", w);

    await send.getByRole("button", { name: "Send invitation" }).click();

    // The question, not the act: it names the address and says what they
    // would find if it went now.
    await expect(send).toContainText(`This emails ${CONTACT} at ${CORRECTED}`);
    await expect(send).toContainText("Nothing is published yet");
    await expect(send).toContainText("Press again to send it");
    await expect(
      send.getByRole("button", { name: "Yes, send the invitation" }),
    ).toBeVisible();
    await shot(page, "05-send-asked", w);

    // Left exactly as it was. The second press is the action test's.
    await page.reload();
    await expect(cardFor(page, BUSINESS)).toContainText("Not invited yet");
  });

  test("an invited client has no send control at all", async ({ page }) => {
    // The seed's retainer client was invited when it was created, so its
    // card is the other state: no "Not invited yet", and nothing to press.
    const card = cardFor(page, "Northwind Studio");
    await expect(card).not.toContainText("Not invited yet");
    await expect(card.getByText("Send invitation", { exact: true })).toHaveCount(0);
  });

});
