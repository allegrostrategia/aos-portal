import assert from "node:assert/strict";
import { test } from "node:test";

import { offers } from "./formulas.ts";
import { calculateOffer } from "./calculate.ts";
import {
  costBreakdown,
  forecastAhead,
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

test("a bar keeps its offer's colour when the sort moves it", () => {
  // The rule the palette exists for: colour follows the entity, never its
  // rank. These bars are sorted by rate, so the top one is not the first
  // offer — and without `colorIndex` the hue would follow the ranking and
  // stop matching the donut's slice for the same offer on the same screen.
  const figures = figuresFrom(OFFERS);
  const bars = hourlyRateByOffer(figures, "GBP");
  const slices = revenueByOffer(figures, "GBP");

  assert.ok(bars.length > 1, "a one-bar chart cannot show this");
  assert.notDeepEqual(
    bars.map((b) => b.label),
    OFFERS.map((o) => o.name),
    "the sort has to move something, or this test proves nothing",
  );

  for (const bar of bars) {
    const slice = slices.find((s) => s.label === bar.label);
    if (!slice) continue;
    assert.equal(
      bar.colorIndex,
      slice.colorIndex,
      `${bar.label}: the bar and the slice must be the same colour`,
    );
  }
});

test("the margin the offer card rings is a 0-100 number", () => {
  // Scale, stated once in a test rather than guessed at each call site.
  // `percentage()` returns 87 for 87%, and the ring's first version
  // multiplied by 100 again and drew "8700%". Delivery cost is
  // 60 × 40 + 1500 = 3,900, so (9000 − 3900) ÷ 9000 is 56.67%.
  const margin = calculateOffer(OFFERS[0], offers.totalRevenue(OFFERS)).offers_margin;
  assert.ok(margin !== null && margin > 1, "a proportion would be 0.57, not 57");
  assert.equal(Math.round(margin * 100) / 100, 56.67);
});


/**
 * What the rest of the year is forecast at, and where that comes from.
 *
 * The one place the published freeze is read. Absent is not empty: a
 * month published before 13 November has no `forecastAhead` key at all
 * and must fall back to the live forecast rather than draw nothing.
 */
const FORECASTS = [
  { salesRowId: "r1", month: "2026-09-01", amount: 1200 },
  { salesRowId: "r1", month: "2026-10-01", amount: 1200 },
  { salesRowId: "r2", month: "2026-10-01", amount: 300 },
  { salesRowId: "r1", month: "2026-11-01", amount: 1200 },
];

const withForecast = (
  forecasts: typeof FORECASTS,
  carried?: { forecastAhead?: { month: string; amount: number }[] },
): MonthFigures =>
  ({
    ledger: { rows: [], actuals: [], forecasts },
    carried: carried ?? null,
  }) as unknown as MonthFigures;

test("the months after this one, summed, and never this one", () => {
  const bars = forecastAhead(withForecast(FORECASTS), "2026-09-01", "GBP");
  assert.deepEqual(
    bars.map((b) => [b.label, b.value, b.display]),
    [
      ["October", 1500, "£1,500"],
      ["November", 1200, "£1,200"],
    ],
    "September is the month being reported on, not a month still to come",
  );
});

test("a published month draws what it was published with", () => {
  // The forecast has since been revised to £9,000; the frozen snapshot
  // is what the client read and is what the report goes on showing.
  const bars = forecastAhead(
    withForecast([...FORECASTS, { salesRowId: "r3", month: "2026-12-01", amount: 9000 }], {
      forecastAhead: [
        { month: "2026-10-01", amount: 1500 },
        { month: "2026-11-01", amount: 1200 },
      ],
    }),
    "2026-09-01",
    "GBP",
  );
  assert.deepEqual(bars.map((b) => b.value), [1500, 1200], "not 9,000 of December");
});

test("a snapshot written before the freeze reads the live forecast", () => {
  // Absent, not empty — `carried` with no `forecastAhead` key at all.
  const bars = forecastAhead(withForecast(FORECASTS, {}), "2026-09-01", "GBP");
  assert.deepEqual(bars.map((b) => b.value), [1500, 1200]);
});

test("a month nobody forecast is left out rather than drawn as nothing", () => {
  const bars = forecastAhead(
    withForecast([{ salesRowId: "r1", month: "2026-12-01", amount: 0 }]),
    "2026-09-01",
    "GBP",
  );
  assert.deepEqual(bars, [], "a zero is not a forecast of nothing");
});


/**
 * Where the money came from — the Offers donut (§5.10).
 *
 * One slice per offer and one for everything else, totalling the
 * month's revenue. Each offer's own figure comes off `offerRows`, which
 * is money received on the Financials rows linked to it, so this chart
 * and the Offers table above it cannot differ.
 */
const WHERE_ROWS = [
  { id: "r1", name: "Signature programme", rowType: "offer" as const, offerEntityId: "o1", active: true, recurrence: "none" as const },
  { id: "r2", name: "Mini course", rowType: "offer" as const, offerEntityId: "o2", active: true, recurrence: "none" as const },
  { id: "r3", name: "Bella Ltd", rowType: "client" as const, offerEntityId: null, active: true, recurrence: "monthly" as const },
  { id: "r4", name: "Crane & Co", rowType: "client" as const, offerEntityId: null, active: true, recurrence: "none" as const },
];
const WHERE_ACTUALS = [
  { salesRowId: "r1", month: "2026-09-01", amount: 4000, recurrence: "none" as const },
  { salesRowId: "r2", month: "2026-09-01", amount: 500, recurrence: "none" as const },
  { salesRowId: "r3", month: "2026-09-01", amount: 1200, recurrence: "monthly" as const },
  { salesRowId: "r4", month: "2026-09-01", amount: 800, recurrence: "none" as const },
];

/** Offer rows as `month-figures` builds them: revenue off the grid. */
const whereFigures = (offers: { name: string; revenue: number | null }[], actuals = WHERE_ACTUALS) =>
  ({
    offerRows: offers.map((o) => ({ ...o, hourlyCost: 40, unitsSold: null, hoursSpent: null })),
    results: { offers_total_revenue_from_offers: null },
    ledger: { rows: WHERE_ROWS, actuals, forecasts: [] },
    carried: null,
  }) as unknown as MonthFigures;

test("each offer's money, and everything else as one slice", () => {
  const slices = revenueByOffer(
    whereFigures([
      { name: "Signature programme", revenue: 4000 },
      { name: "Mini course", revenue: 500 },
    ]),
    "GBP",
    "2026-09-01",
  );

  assert.deepEqual(
    slices.map((s) => [s.label, s.value]),
    [
      ["Signature programme", 4000],
      ["Mini course", 500],
      // Two clients, one slice — not two, and not forty for an agency.
      ["Bespoke work · 2 clients", 2000],
    ],
  );
  assert.equal(
    slices.reduce((t, s) => t + s.value, 0),
    6500,
    "the donut totals the month's revenue, or the card above it is a second answer",
  );
});

test("without a month it is the offers alone, as it was before", () => {
  // Every caller that wants the offers' own share and nothing else.
  const slices = revenueByOffer(
    whereFigures([
      { name: "Signature programme", revenue: 4000 },
      { name: "Mini course", revenue: 500 },
    ]),
    "GBP",
  );
  assert.deepEqual(slices.map((s) => s.label), ["Signature programme", "Mini course"]);
});

test("an offer that earned nothing this month keeps its colour for the next", () => {
  const slices = revenueByOffer(
    whereFigures([
      { name: "Retired thing", revenue: null },
      { name: "Signature programme", revenue: 4000 },
      { name: "Mini course", revenue: 500 },
    ]),
    "GBP",
    "2026-09-01",
  );
  // The colour index is the offer's own position, so the two that did
  // earn keep 1 and 2 rather than sliding to 0 and 1.
  assert.deepEqual(
    slices.map((s) => s.colorIndex),
    [1, 2, 3],
  );
});

test("one client on their own is one client, not 1 clients", () => {
  const slices = revenueByOffer(
    whereFigures(
      [],
      [{ salesRowId: "r3", month: "2026-09-01", amount: 1200, recurrence: "monthly" as const }],
    ),
    "GBP",
    "2026-09-01",
  );
  assert.deepEqual(slices.map((s) => s.label), ["Bespoke work · 1 client"]);
});

test("an offer row nobody linked is not called bespoke work", () => {
  // The cards split revenue by the row's KIND; this chart splits it by
  // the offer LINK, because a slice is an offer. A row typed as an
  // offer and never linked falls between them, and the label says so
  // rather than calling a programme somebody's bespoke work.
  const unlinked = {
    offerRows: [],
    results: {},
    ledger: {
      rows: WHERE_ROWS.map((r) => ({ ...r, offerEntityId: null })),
      actuals: WHERE_ACTUALS,
      forecasts: [],
    },
    carried: null,
  } as unknown as MonthFigures;

  assert.deepEqual(
    revenueByOffer(unlinked, "GBP", "2026-09-01").map((s) => [s.label, s.value]),
    [["Not linked to an offer · 4 rows", 6500]],
  );
});

test("a month nobody entered has no donut rather than an empty one", () => {
  const slices = revenueByOffer(
    whereFigures([{ name: "Signature programme", revenue: null }], []),
    "GBP",
    "2026-12-01",
  );
  assert.deepEqual(slices, [], "and the page draws nothing at all");
});
