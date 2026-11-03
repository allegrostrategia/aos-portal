import { expect, test } from "@playwright/test";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * Leads & Conversions.
 *
 * The page had no spec of its own until Nina's review of 3 November
 * asked for two things on it.
 */

requireLocalStack();

const TAB = "leads";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

test.beforeEach(async () => {
  const { seed } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
});

/**
 * Nina: "add New leads from ads".
 *
 * It was already there and already right — 100 leads, added up from the
 * Ads tab's campaigns — but only as a line in "Everything else this
 * month", because a figure could be a card if it was typed or worked out
 * and not if it came from another tab. So the test is about *where* it
 * is, not whether it exists, and a card is what `data-kpi` names.
 */
test("New leads from ads is a card, not a line in the overflow", async ({ page }, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);

  const card = page.locator('[data-kpi="New leads from ads"]');
  await expect(card).toBeVisible();
  // The figure the Ads tab adds up: 60 on Lead form, 40 on Workshop opt-in.
  await expect(card).toContainText("100");

  // And it is not said twice — once as a card and once in the list below.
  const overflow = page.locator("dl, [data-overflow]").getByText("New leads from ads");
  await expect(overflow).toHaveCount(0);

  await shoot(page, TAB, "01-leads-report", w);
});
