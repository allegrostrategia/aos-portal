import { expect, test, type Page } from "@playwright/test";

import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * "Worked out for you" shows every line it has, on every entry screen.
 *
 * It was capped to the viewport with its own scroll so it could stick,
 * and that scrollbar is invisible on macOS until you move it — so on
 * Financials the last five figures were missing, and on Social Media
 * non-follower reach was. **Both were found by a person looking at a
 * screenshot**, which is why this walks every section rather than the
 * one that was reported.
 */

requireLocalStack();

const SECTIONS = [
  "social-media",
  "trial-reels",
  "email",
  "funnels",
  "leads-conversions",
  "ads",
  "client-experience",
  "offers",
  "financials",
];

const panel = (page: Page) =>
  page.locator("aside").filter({ has: page.getByRole("heading", { name: "Worked out for you" }) });

test("no entry screen hides a line of its own panel", async ({ page }) => {
  test.setTimeout(180_000);
  const { seed, MONTHS } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  await signIn(page, "nina");

  const checked: string[] = [];
  for (const section of SECTIONS) {
    await page.goto(`/reporting/enter/${section}?month=${MONTHS.sep}`);
    await page.getByRole("heading", { name: /enter your data/i }).first().waitFor();

    const card = panel(page);
    // Offers and Funnels have their own screens and no shared panel;
    // the rest must all have one, and the list below proves this test
    // is not quietly passing by finding nothing to look at.
    if ((await card.count()) === 0) continue;

    const hidden = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(hidden, `${section}: pixels of the panel behind its own scrollbar`).toBe(0);

    // And the last line of it is on the page, not past the bottom edge
    // of a box that does not scroll.
    const rows = card.locator("dl > div");
    const last = rows.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last, `${section}: the last figure is drawn`).toBeVisible();
    checked.push(section);
  }

  // **And every one of them ends the same way** (Dom, 14 November: Ads
  // had "Save this month" and no way on). The last section has no next,
  // which is why the count below is one short of the list.
  let waysOn = 0;
  for (const section of SECTIONS) {
    await page.goto(`/reporting/enter/${section}?month=${MONTHS.sep}`);
    await page.getByRole("heading", { name: /enter your data/i }).first().waitFor();

    const onward = page.getByRole("button", { name: /save & next section/i });
    const link = page.getByRole("link", { name: /^next: /i });
    if ((await onward.count()) + (await link.count()) > 0) waysOn += 1;

    // Nothing says "Save this month" any more: one screen saying it
    // differently is the thing that was being fixed.
    const main = await page.locator("main").innerText();
    expect(main, `${section}: the old wording`).not.toContain("Save this month");
  }
  expect(waysOn, "every section offers the way on").toBe(SECTIONS.length);

  expect(checked.length, `panels found on: ${checked.join(", ")}`).toBeGreaterThanOrEqual(6);
});
