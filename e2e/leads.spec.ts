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

/**
 * Nina: "potential revenue (leads x product price)".
 *
 * Two lines, because one of them is a fantasy: leads multiplied by a
 * price assumes every lead buys. The second weights it by the rate at
 * which this client's leads actually become clients, and the caption
 * says both the price and the rate, so nothing on the card is a number
 * the reader has to take on trust.
 *
 * Driven through the real settings form, because the price is a thing
 * somebody types and the question "does typing it make the figure
 * appear" is the whole feature.
 */
test("potential revenue appears once a price is set, and says what it used", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // Nothing at all before a price is typed - not a zero, not an empty
  // card. A missing price is a statement about the setup.
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("What those leads could be worth")).toHaveCount(0);

  await page.goto(`/reporting/settings`);
  await page.getByLabel(/Price used for potential revenue/i).fill("400");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("What those leads could be worth")).toBeVisible();
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  // 128 leads in September - 20 social, 8 email, 100 from the Ads tab -
  // at £400 is £51,200, and 4 of those 128 became clients, which is
  // 3.1%: £1,600, or four sales, which is the point of the second line.
  expect(text).toContain("£51,200");
  expect(text).toContain("£1,600");
  expect(text).toContain("128 leads at £400 a sale");
  expect(text).toContain("3.1% of leads became clients");

  await shoot(page, TAB, "02-potential-revenue", w);
});
