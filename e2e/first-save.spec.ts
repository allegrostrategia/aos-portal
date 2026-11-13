import { expect, test } from "@playwright/test";

import { SAVE_CONFIRMED, requireLocalStack, signIn } from "./helpers.ts";

type Page = import("@playwright/test").Page;

/**
 * The first save of an empty month says so. Every entry screen, both widths.
 *
 * **This is the case that keeps escaping** (Dom, 14 November). Social
 * Media's first save landed in the database and the screen went on
 * saying "Nothing is saved until you press save." — because the save
 * made a section appear, React rebuilt the form, and the notice the
 * action returned went with it. `saved-notice.ts` already says this
 * project has been caught by it three times; that was the fourth.
 *
 * It escapes because every test of a save tests the SECOND one: a seeded
 * month, a figure corrected. The screen is already in its settled shape,
 * nothing appears, nothing is rebuilt, and the notice survives. The
 * first save of an empty month is the one a person actually does, and
 * the one nothing covered.
 *
 * October is the empty month in the seed, which is why it is here.
 *
 * One test per screen rather than a loop, so a failure names the screen
 * in its title instead of an index.
 */

requireLocalStack();

/** Type into the first figure on the screen, whatever that screen is. */
async function fillSomething(page: Page) {
  const box = page.locator('main input[inputmode="decimal"]:not([disabled])').first();
  await expect(box, "a figure to type into").toBeVisible();
  await box.fill("7");
}

async function firstSaveSaysSo(page: Page, slug: string) {
  const { MONTHS } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/${slug}?month=${MONTHS.oct}`);

  // Nothing has been saved yet, so nothing may claim otherwise.
  await expect(page.getByText(SAVE_CONFIRMED)).toHaveCount(0);

  await fillSomething(page);
  await page.getByRole("button", { name: "Save draft" }).first().click();
  await expect(page.getByText(SAVE_CONFIRMED).first()).toBeVisible();
}

for (const slug of [
  "social-media",
  "trial-reels",
  "email",
  "funnels",
  "leads-conversions",
  "ads",
  "client-experience",
  "offers",
]) {
  test(`${slug}: the first save of an empty month says so`, async ({ page }) => {
    const { seed } = await import("../scripts/seed-test-db.mjs");
    await seed({ quiet: true });
    await firstSaveSaysSo(page, slug);
  });
}

/**
 * Financials has no save bar — three grids with their own saves sit
 * under it, so one box left in the form saves on blur (Dom, 13
 * November). Same promise, different control: the note under it has to
 * answer "did that save?" the first time as well as the second.
 */
test("financials: the first save of an empty month says so", async ({ page }) => {
  const { MONTHS, seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/financials?month=${MONTHS.oct}`);

  await expect(page.getByText(SAVE_CONFIRMED)).toHaveCount(0);
  await page.getByLabel(/cash in bank/i).fill("9000");
  await page.getByLabel(/cash in bank/i).blur();
  await expect(page.getByText(SAVE_CONFIRMED).first()).toBeVisible();
});
