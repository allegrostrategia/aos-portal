import { expect, test } from "@playwright/test";

import { requireLocalStack, shoot, signIn } from "./helpers.ts";

/**
 * The Financials report, which is what the three grids are entered for.
 *
 * Nina, 13 November: "the headline is actual money received, with the
 * forecast for the month beside it", and the report draws actual against
 * forecast across the year. This walks the entry screen first, because a
 * report of a month nobody filled in proves nothing.
 */

requireLocalStack();

const card = (page: import("@playwright/test").Page, heading: string | RegExp) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading }) });

test("what came in, what was expected, and what is still to come", async ({ page }, info) => {
  const w = (info.project.name === "phone" ? "phone" : "desktop") as "phone" | "desktop";
  const { seed, MONTHS } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  await signIn(page, "nina");

  // A month with money and costs in it, entered the way a person would.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const setup = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your rows", exact: true }) });
  await setup.getByLabel("Name").fill("Signature programme");
  // Linked to the offer of the same name, which is what puts its money
  // in that offer's slice rather than in the catch-all.
  await setup.getByLabel("Link to an offer").selectOption({ label: "Signature programme" });
  await setup.getByRole("button", { name: /add the row/i }).click();
  await page.getByText(/Signature programme added/i).waitFor();
  await setup.getByLabel("Name").fill("Bella Ltd");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByLabel("Does it recur?").selectOption("monthly");
  await setup.getByLabel("Name").press("Enter");
  await page.getByText(/Bella Ltd added/i).waitFor();

  const came = page.locator("section").filter({ has: page.getByRole("heading", { name: "What came in", exact: true }) });
  await came.getByLabel(/^Signature programme, September 2026$/).fill("4000");
  await came.getByLabel(/^Bella Ltd, September 2026$/).fill("1200");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await came.getByText(/^Saved\.$/).waitFor();

  const expected = page.locator("section").filter({ has: page.getByRole("heading", { name: "What you expect", exact: true }) });
  await expected.getByLabel(/^Bella Ltd, September 2026$/).fill("1200");
  await expected.getByLabel(/^Bella Ltd, October 2026$/).fill("1200");
  await expected.getByLabel(/^Bella Ltd, November 2026$/).fill("1200");
  await expected.getByRole("button", { name: /save what you expect/i }).click();
  await expected.getByText(/^Saved\.$/).waitFor();

  const categories = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your cost categories", exact: true }) });
  await categories.getByRole("button", { name: /start with the usual list/i }).click();
  await page.getByText(/categories added/i).waitFor();
  const cost = page.locator("section").filter({ has: page.getByRole("heading", { name: "What it cost", exact: true }) });
  await cost.getByLabel(/^Software, September 2026$/).fill("300");
  await cost.getByLabel(/^Ads, September 2026$/).fill("600");
  await cost.getByLabel(/^Staff, September 2026$/).fill("1500");
  await cost.getByRole("button", { name: /save what it cost/i }).click();
  await cost.getByText(/^Saved\.$/).waitFor();

  // --- the report ----------------------------------------------------------
  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);
  await page.getByRole("heading", { name: /financials/i }).first().waitFor();

  /**
   * **The six cards are the six a P&L is read for.** Before this they
   * were the first six figures the month had, in the metric list's own
   * order — the two revenue halves and three cost buckets, which left
   * Profit and the margin in the overflow panel under a donut already
   * drawing those buckets.
   */
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(main, "money in").toContain("Total revenue");
  expect(main, "and what was expected, beside it").toContain("Money expected");
  expect(main, "profit, which is what the page is read for").toContain("Profit");

  // £4,000 + £1,200 in, £1,200 forecast for the month, £2,400 out.
  expect(main).toContain("£5,200");
  expect(main).toContain("£1,200");
  expect(main).toContain("£2,400");

  /**
   * **"What came in, against what you expected" is gone** (Nina, 15
   * November) and so is the MRR card. One monthly recurring figure is
   * this month's recurring total sitting beside eleven other figures
   * about this month, and it says nothing about whether the retainers
   * are still there in February — which is the only question MRR is
   * ever asked.
   */
  await expect(
    page.getByRole("heading", { name: "What came in, against what you expected" }),
  ).toHaveCount(0);
  // Above the year grid, which legitimately carries MRR as a row —
  // twelve months of it is placeable in time, which is the whole
  // objection to the card.
  const aboveTheYear = main.slice(0, main.indexOf("Your year, month by month"));
  expect(aboveTheYear, "the single MRR card is replaced by the chart below").not.toContain(
    "Monthly recurring revenue",
  );

  // **Four months of it instead**: this one and the next three, off the
  // forecast on rows marked recurring. Bella Ltd is the monthly row and
  // was forecast at £1,200 for September, October and November.
  const recurring = card(page, "Confirmed recurring revenue");
  const recurringText = (await recurring.innerText()).replace(/\s+/g, " ");
  expect(recurringText, "September, the month being read").toContain("Sep");
  expect(recurringText).toContain("Oct");
  expect(recurringText).toContain("Nov");
  expect(recurringText, "and December, which has no forecast yet").toContain("Dec");
  expect(recurringText, "Bella Ltd's retainer").toContain("£1,200");

  // **The year grid, on every page now** (Nina, 15 November).
  const year = card(page, "Your year, month by month");
  const yearText = (await year.innerText()).replace(/\s+/g, " ");
  expect(yearText, "January to December, not the last twelve months").toContain("Jan");
  expect(yearText).toContain("Dec");
  expect(yearText, "and a year column").toContain("Year");
  expect(yearText, "September's revenue, in its own column").toContain("£5,200");

  // **What the rest of the year is forecast at** — the only
  // forward-looking figure on the report, and the only place the
  // published freeze is read.
  const ahead = card(page, "Still expected this year");
  const aheadText = (await ahead.innerText()).replace(/\s+/g, " ");
  expect(aheadText, "October and November were typed into the forecast grid").toContain("October");
  expect(aheadText).toContain("November");
  expect(aheadText, "and the two of them together").toContain("£2,400");
  expect(aheadText, "September is the month being reported, not one still to come").not.toContain(
    "September",
  );

  // **The overflow panel is for what has nowhere else to go.** The four
  // cost buckets were in it, under a donut drawing those same figures.
  const overflow = card(page, "Everything else this month");
  const overflowText = (await overflow.innerText()).replace(/\s+/g, " ");
  expect(overflowText, "the donut has these three").not.toContain("Fixed costs");
  expect(overflowText).not.toContain("Variable costs");
  expect(overflowText).not.toContain("Team costs");
  expect(overflowText, "and the revenue halves still have nowhere else").toContain(
    "Revenue from offers",
  );

  // August exists as a month and holds nothing, so there is nothing to
  // compare against and the panel does not claim there is.
  expect(overflowText, "no figures last month, so no 'vs.'").not.toContain("vs. August");

  await shoot(page, "financials-report", "01-report", w);

  /**
   * **Where it came from is on Offers**, which is where the brief put
   * it: the offer row's own slice and the client row as one bespoke
   * slice, totalling the month's revenue. It was on Financials for half
   * a day, while the Offers donut was still drawing typed revenue and
   * the two would have disagreed.
   */
  await page.goto(`/reporting/offers?month=${MONTHS.sep}`);
  const from = card(page, "Where the money came from");
  const fromText = (await from.innerText()).replace(/\s+/g, " ");
  expect(fromText, "the linked row's own offer").toContain("Signature programme");
  expect(fromText, "and the client row, counted").toContain("Bespoke work · 1 client");
  expect(fromText, "the donut totals the month").toContain("£5,200");
  await shoot(page, "financials-report", "03-offers-donut", w);
});

/**
 * THE POINT of the freeze: a published month's forward figure does not
 * move when a later month's forecast is revised.
 *
 * `Carried.forecastAhead` is written at publish and read here, and this
 * is the only screen that reads it — so until this test existed, the
 * freeze was a snapshot nothing looked at.
 */
test("a published month keeps the forecast it went out with", async ({ page }, info) => {
  const w = (info.project.name === "phone" ? "phone" : "desktop") as "phone" | "desktop";
  const { seed, MONTHS } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });
  await signIn(page, "nina");

  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  const setup = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Your rows", exact: true }) });
  await setup.getByLabel("Name").fill("Bella Ltd");
  await setup.getByLabel("What it is").selectOption("client");
  await setup.getByRole("button", { name: /add the row/i }).click();
  await page.getByText(/Bella Ltd added/i).waitFor();

  // Money in September as well: a report of a month with nothing in it
  // draws its empty state, and this test is about a panel on the report.
  const came = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "What came in", exact: true }) });
  await came.getByLabel(/^Bella Ltd, September 2026$/).fill("1200");
  await came.getByRole("button", { name: /save what came in/i }).click();
  await came.getByText(/^Saved\.$/).waitFor();

  const expected = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "What you expect", exact: true }) });
  await expected.getByLabel(/^Bella Ltd, October 2026$/).fill("1200");
  await expected.getByLabel(/^Bella Ltd, November 2026$/).fill("1200");
  await expected.getByRole("button", { name: /save what you expect/i }).click();
  await expected.getByText(/^Saved\.$/).waitFor();

  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await page.getByRole("button", { name: /publish this month/i }).click();
  await expect(page.getByText(/^Published$/).first()).toBeVisible();

  const stillExpected = async () =>
    (await card(page, "Still expected this year").innerText()).replace(/\s+/g, " ");

  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);
  expect(await stillExpected(), "what September went out with").toContain("£2,400");
  await shoot(page, "financials-report", "02-published", w);

  // November is revised upward. It is a draft, so the change goes
  // through — and September must not notice.
  await page.goto(`/reporting/enter/financials?month=${MONTHS.sep}`);
  await expected.getByLabel(/^Bella Ltd, November 2026$/).fill("9000");
  await expected.getByRole("button", { name: /save what you expect/i }).click();
  await expected.getByText(/^Saved\.$/).waitFor();

  await page.goto(`/reporting/financials?month=${MONTHS.sep}`);
  const after = await stillExpected();
  expect(after, "still what it was published with").toContain("£2,400");
  expect(after, "not the revision").not.toContain("£10,200");
});
