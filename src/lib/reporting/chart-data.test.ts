import assert from "node:assert/strict";
import { test } from "node:test";

import { offers } from "./formulas.ts";
import { calculateOffer } from "./calculate.ts";
import {
  costBreakdown,
  hourlyRateByOffer,
  leadsBySource,
  revenueByOffer,
} from "./chart-data.ts";
import type { MonthFigures } from "./month-figures.ts";
import type { OfferMonth } from "./formulas.ts";

/**
 * What the charts draw, and where the numbers come from.
 *
 * **The point of this file is that no chart does its own arithmetic.** Dom's
 * condition, 5 October: the hourly-rate chart must take its values from
 * `offers.effectiveHourlyRate` via `calculateOffer`, never recompute them,
 * so the chart and the Offers summary card cannot disagree. The first plan
 * had the formula as revenue ÷ hours; §5.9 is (revenue − other direct
 * costs) ÷ hours, and a chart carrying its own wrong version of that would
 * have been a second answer on the same screen.
 */

const OFFERS: OfferMonth[] = [
  // Other direct costs entered, which is the case that separates the right
  // formula from the plausible one: 9,000 ÷ 60 is 150, and the answer is 125.
  {
    name: "Mastermind",
    hourlyCost: 40,
    unitsSold: 6,
    revenue: 9000,
    hoursSpent: 60,
    otherDirectCosts: 1500,
  },
  // No other direct costs: the two formulas agree here, which is why a test
  // using only this offer would have proved nothing.
  { name: "Power hour", hourlyCost: 40, unitsSold: 10, revenue: 2000, hoursSpent: 10 },
  // No hours: it keeps its place and says why.
  { name: "Audit", hourlyCost: 40, unitsSold: 2, revenue: 1200, hoursSpent: null },
];

/** Enough of MonthFigures for the builders, with nothing recomputed. */
function figuresFrom(
  offerRows: OfferMonth[],
  monthly: Record<string, number | null> = {},
): MonthFigures {
  const total = offers.totalRevenue(offerRows);
  return {
    metrics: [],
    data: {} as MonthFigures["data"],
    results: {
      offers_total_revenue_from_offers: total,
      financials_total_costs: monthly.financials_total_costs ?? null,
    },
    previousResults: {},
    figure: (key: string) => monthly[key] ?? null,
    previousFigure: () => null,
    offerRows,
    byKey: new Map(),
  } as unknown as MonthFigures;
}

test("the hourly-rate bars are the formula module's own numbers", () => {
  const figures = figuresFrom(OFFERS);
  const bars = hourlyRateByOffer(figures, "GBP");

  for (const offer of OFFERS) {
    const expected = calculateOffer(offer, offers.totalRevenue(OFFERS))
      .offers_effective_hourly_rate;
    const bar = bars.find((b) => b.label === offer.name);
    assert.ok(bar, `${offer.name} has a row`);
    assert.equal(
      bar.value,
      expected ?? null,
      `${offer.name}: the bar must be what calculateOffer says`,
    );
  }
});

test("other direct costs come off before the division", () => {
  // The explicit worked case, so the number is in the test and not only in
  // an identity against the module: (9000 − 1500) ÷ 60.
  const bars = hourlyRateByOffer(figuresFrom(OFFERS), "GBP");
  const mastermind = bars.find((b) => b.label === "Mastermind");

  assert.equal(mastermind?.value, 125);
  assert.notEqual(mastermind?.value, 150, "revenue ÷ hours would be 150, and would be wrong");
  assert.equal(mastermind?.display, "£125");
});

test("an offer with no hours keeps its row and says why", () => {
  const bars = hourlyRateByOffer(figuresFrom(OFFERS), "GBP");
  const audit = bars.find((b) => b.label === "Audit");

  assert.equal(audit?.value, null, "no bar");
  assert.equal(audit?.missingNote, "hours not entered");
});

test("the bars are sorted, with the rateless one last", () => {
  const bars = hourlyRateByOffer(figuresFrom(OFFERS), "GBP");
  assert.deepEqual(
    bars.map((b) => b.label),
    ["Power hour", "Mastermind", "Audit"],
    "200, then 125, then the one with no rate",
  );
});

test("share of revenue keeps the offers' own order, not size order", () => {
  // Fed in smallest-first: if this sorted, the order would come back
  // reversed. It must not, because colour is taken from position and an
  // offer that overtakes another would otherwise swap colours with it.
  const slices = revenueByOffer(figuresFrom([...OFFERS].reverse()), "GBP");
  assert.deepEqual(
    slices.map((s) => [s.label, s.value]),
    [
      ["Audit", 1200],
      ["Power hour", 2000],
      ["Mastermind", 9000],
    ],
  );
  assert.equal(slices[2].display, "£9,000");
});

test("an offer keeps its colour when another one drops out", () => {
  // September: all three earn. October: the middle one earns nothing. The
  // two that remain must keep the colours they had.
  const september = revenueByOffer(figuresFrom(OFFERS), "GBP");
  const october = revenueByOffer(
    figuresFrom([
      OFFERS[0],
      { ...OFFERS[1], revenue: null },
      OFFERS[2],
    ]),
    "GBP",
  );

  const colourOf = (slices: typeof september, label: string) =>
    slices.find((s) => s.label === label)?.colorIndex;

  assert.equal(colourOf(october, "Mastermind"), colourOf(september, "Mastermind"));
  assert.equal(colourOf(october, "Audit"), colourOf(september, "Audit"));
  assert.equal(october.length, 2, "and the one that earned nothing is not a slice");
});

test("a cost line at nothing does not repaint the others", () => {
  const full = costBreakdown(
    figuresFrom([], {
      financials_fixed_costs: 1200,
      financials_variable_costs: 800,
      financials_team_costs: 2000,
    }),
    "GBP",
  );
  const noFixed = costBreakdown(
    figuresFrom([], { financials_variable_costs: 800, financials_team_costs: 2000 }),
    "GBP",
  );

  for (const label of ["Variable", "Team"]) {
    assert.equal(
      noFixed.find((s) => s.label === label)?.colorIndex,
      full.find((s) => s.label === label)?.colorIndex,
      `${label} keeps its colour`,
    );
  }
});

test("an offer with no revenue is not a slice of nothing", () => {
  const slices = revenueByOffer(
    figuresFrom([{ name: "Unsold", hourlyCost: 40, unitsSold: null, revenue: null, hoursSpent: 4 }]),
    "GBP",
  );
  assert.deepEqual(slices, []);
});

test("leads by source: entered sources only, biggest first", () => {
  const figures = figuresFrom([], {
    leads_conversions_new_leads_from_social: 40,
    leads_conversions_new_leads_from_email: 12,
    leads_conversions_new_leads_from_referral: 0,
    // ads and other not entered at all
  });

  assert.deepEqual(
    leadsBySource(figures).map((d) => [d.label, d.value]),
    [
      ["Social", 40],
      ["Email", 12],
      // A genuine zero is an answer and stays (§4). "Not entered" is not,
      // and Ads is absent rather than drawn as nothing.
      ["Referral", 0],
    ],
  );
});

test("the cost donut is the four lines, and skips the ones at nothing", () => {
  const figures = figuresFrom([], {
    financials_fixed_costs: 1200,
    financials_variable_costs: 800,
    financials_team_costs: 2000,
    financials_investment_spend: null,
    financials_total_costs: 4000,
  });

  assert.deepEqual(
    costBreakdown(figures, "GBP").map((s) => [s.label, s.value]),
    [
      ["Fixed", 1200],
      ["Variable", 800],
      ["Team", 2000],
    ],
  );
});
