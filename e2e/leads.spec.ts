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
 * says the offer, the price and the rate, so nothing on the card is a
 * number the reader has to take on trust.
 *
 * **The price is not typed anywhere** (Dom, 4 November). The settings
 * screen picks WHICH offer the leads are for; the price comes off that
 * offer, which is the same number the Offers page shows. Driven through
 * the real form, because "does choosing it make the figure appear" is
 * the whole feature.
 */
test("potential revenue appears once an offer is chosen, and says what it used", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");

  // Nothing at all before an offer is chosen - not a zero, not an empty
  // card. A missing choice is a statement about the setup.
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("What those leads could be worth")).toHaveCount(0);

  await page.goto(`/reporting/settings`);
  // The option carries the price, so whoever is choosing can see what
  // they are choosing. Northwind's one offer now sells for £800.
  await page
    .getByLabel(/Offer used for potential revenue/i)
    .selectOption({ label: "Signature programme — £800" });
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("What those leads could be worth")).toBeVisible();
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  // 128 leads in September - 20 social, 8 email, 100 from the Ads tab -
  // at £800 is £102,400, and 4 of those 128 became clients, which is
  // 3.1%: £3,200, or four sales, which is the point of the second line.
  expect(text).toContain("£102,400");
  expect(text).toContain("£3,200");
  expect(text).toContain("128 leads at £800 a sale");
  expect(text).toContain("(Signature programme)");
  expect(text).toContain("3.1% of leads became clients");

  await shoot(page, TAB, "02-potential-revenue", w);
});

/**
 * The reason it is a choice of offer rather than a typed price.
 *
 * A second copy of a price drifts: the day the offer goes from £800 to
 * £900, Offers says one thing and Leads & Conversions goes on quietly
 * saying the other. Here the offer's price moves and the figure moves
 * with it, with nobody opening the settings screen.
 */
test("the figure follows the offer's price, with nothing else touched", async ({ page }) => {
  const { sql } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");

  await page.goto(`/reporting/settings`);
  await page
    .getByLabel(/Offer used for potential revenue/i)
    .selectOption({ label: "Signature programme — £800" });
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("£102,400")).toBeVisible();

  // The price rises on the Offers side, which is the only place it lives.
  sql(`update public.report_entities set price = 900
        where entity_type = 'offer' and name = 'Signature programme';`);

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("£115,200"), "128 x £900").toBeVisible();
  await expect(page.getByText("£102,400")).toHaveCount(0);
});
