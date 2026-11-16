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
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

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
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("£102,400")).toBeVisible();

  // The price rises on the Offers side, which is the only place it lives.
  sql(`update public.report_entities set price = 900
        where entity_type = 'offer' and name = 'Signature programme';`);

  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  await expect(page.getByText("£115,200"), "128 x £900").toBeVisible();
  await expect(page.getByText("£102,400")).toHaveCount(0);
});

/**
 * Nina, 16 November: "what the calls turned into".
 *
 * The funnel and the breakdown are one feature in two halves — how far
 * people got, and what the ones who got all the way bought — so they are
 * checked together on the page a client reads.
 *
 * **Won is 3 and new clients is 4**, which is the seed's point: somebody
 * bought in September without ever being on a call. A funnel whose last
 * step read 4 would be drawing a bottom wider than the step above it and
 * claiming four calls closed when three did.
 */
test("the funnel ends at calls converted, and the breakdown says what they bought", async ({
  page,
}, info) => {
  const w = width(info.project.name);
  await signIn(page, "nina");
  await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);

  const funnel = page.locator("figure, section").filter({ hasText: "How far they got" }).first();
  await expect(funnel).toBeVisible();
  const steps = (await funnel.innerText()).replace(/\s+/g, " ");
  expect(steps).toContain("Leads");
  expect(steps).toContain("128");
  expect(steps).toContain("Calls booked");
  expect(steps).toContain("24");
  expect(steps).toContain("Calls held");
  expect(steps).toContain("18");
  expect(steps).toContain("Won");
  expect(steps).toContain("3");

  // **And the close rate must be measuring the same thing the funnel's
  // last step shows** (Dom, 16 November): 3 converted of 18 held is
  // 16.7%, where the old rule — 4 new clients of 18 — would print 22.2%
  // beside a funnel saying 3. The wrong one is asserted absent as well,
  // because "16.7% is somewhere on the page" would pass with both on it.
  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(body, "close rate is converted ÷ held").toContain("16.7%");
  expect(body, "not new clients ÷ held").not.toContain("22.2%");

  // What those calls bought: two of the three were the Signature
  // programme at £800, and the third was work priced per job on the
  // bespoke line at £1,750. The rows add up to the funnel's last step,
  // which is the thing worth being able to check.
  const bought = page.locator("section").filter({ hasText: "What the calls bought" }).first();
  await expect(bought).toBeVisible();
  const table = (await bought.innerText()).replace(/\s+/g, " ");
  expect(table).toContain("Signature programme");
  expect(table).toContain("£1,600");
  expect(table, "work priced per job").toContain("Bespoke / other");
  expect(table).toContain("£1,750");
  expect(table, "2 + 1 sales, £1,600 + £1,750").toContain("£3,350");

  await shoot(page, TAB, "03-calls-converted", w);
});

/**
 * And the screen somebody types it into.
 *
 * The grid is a second form on the entry screen, with its own action, so
 * the first-save rule has to hold for it on its own: a save that lands
 * and says nothing is the bug this project has been caught by four
 * times. October is the empty month in the seed.
 */
test("saving what the calls bought says so, on an empty month", async ({ page }, info) => {
  const w = width(info.project.name);
  const { SAVE_CONFIRMED } = await import("./helpers.ts");
  // The seed's months, not `guard.ts`'s: that list stops at September, so
  // `MONTHS.oct` there is undefined and the URL asks for `month=undefined`.
  // The page falls back to a default which happens to be October today and
  // will not be in December.
  const { MONTHS: SEEDED } = await import("../scripts/seed-test-db.mjs");
  await signIn(page, "nina");
  await page.goto(`/reporting/enter/leads-conversions?month=${SEEDED.oct}`);

  const grid = page.locator("section").filter({ hasText: "What the calls bought" }).first();
  await expect(grid).toBeVisible();
  await expect(page.getByText(SAVE_CONFIRMED)).toHaveCount(0);

  const box = grid.getByLabel("Sales from calls, Signature programme");
  await box.fill("2");
  // The value updates as you type, before anything is saved: £800 each.
  // The offer's own row, not the card: the running total underneath says
  // £1,600 as well, and matching either would pass while the other was
  // blank — the two are worth separating because they come from
  // different sums.
  const row = grid.locator("li").filter({ hasText: "Signature programme" });
  await expect(row.getByText("£1,600")).toBeVisible();
  await expect(grid.getByText(/2 sales off calls, worth/)).toBeVisible();

  // The bespoke line: both figures typed, because work priced per job has
  // no offer and no price to multiply out.
  await grid.getByLabel("Bespoke sales from calls", { exact: true }).fill("1");
  await grid.getByLabel("Value of bespoke sales from calls", { exact: true }).fill("1750");
  await expect(grid.getByText(/3 sales off calls, worth/)).toBeVisible();
  await expect(grid.getByText("£3,350")).toBeVisible();

  await grid.getByRole("button", { name: /save what they bought/i }).click();
  await expect(page.getByText(SAVE_CONFIRMED).first()).toBeVisible();

  // And all three are still there after the navigation the save does.
  await expect(
    page.getByLabel("Sales from calls, Signature programme"),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Bespoke sales from calls", { exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByLabel("Value of bespoke sales from calls", { exact: true }),
  ).toHaveValue("1750");

  await shoot(page, TAB, "04-calls-bought-entry", w);
});
