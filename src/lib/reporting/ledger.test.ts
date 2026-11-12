import test from "node:test";
import assert from "node:assert/strict";

import {
  bespokeRevenue,
  clientProfitability,
  costsByBucket,
  forecastAfter,
  forecastIn,
  monthsToShow,
  offerRevenue,
  receivedIn,
  recurringSplit,
  rowsWithFigures,
  type ActualCell,
  type Cell,
  type ExpenseRow,
  type SalesRow,
} from "./ledger.ts";

/**
 * The arithmetic of the two grids.
 *
 * Nina, 13 November: Actual is money received, Forecast is money
 * expected, and nothing is derived from anything. Which makes most of
 * this file's job keeping "nobody typed anything" and "it was nothing"
 * apart.
 */

const JAN = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";
const APR = "2026-04-01";
const YEAR = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-01`);

const rows: SalesRow[] = [
  {
    id: "r1",
    name: "Signature programme",
    rowType: "offer",
    offerEntityId: "offer-1",
    active: true,
    recurrence: "none",
  },
  {
    id: "r2",
    name: "A retainer client",
    rowType: "client",
    offerEntityId: null,
    active: true,
    recurrence: "monthly",
  },
  {
    id: "r3",
    name: "Another client",
    rowType: "client",
    offerEntityId: null,
    active: true,
    recurrence: "none",
  },
];

const cell = (
  salesRowId: string,
  month: string,
  amount: number,
  recurrence: ActualCell["recurrence"] = "none",
): ActualCell => ({ salesRowId, month, amount, recurrence });

test("the month's figure is what landed, and nothing is a dash", () => {
  const actuals = [cell("r1", JAN, 1200), cell("r2", JAN, 400, "monthly")];

  assert.equal(receivedIn(actuals, JAN), 1600);
  // Not £0. A month nobody has typed into is not a month that earned
  // nothing, and the report must not print them the same.
  assert.equal(receivedIn(actuals, FEB), null);
});

test("a refund is a month where less than nothing landed", () => {
  // Confirmed with Dom, 13 November: no non-negative constraint on an
  // actual, because the figure is what landed and a chargeback is a real
  // thing that happens to a month.
  const actuals = [cell("r1", JAN, 1200), cell("r3", JAN, -250)];
  assert.equal(receivedIn(actuals, JAN), 950, "the refund comes off the month");

  const onlyRefund = [cell("r3", FEB, -250)];
  assert.equal(receivedIn(onlyRefund, FEB), -250, "and a month can be negative outright");
});

test("forecast is its own figure, beside actual and never derived from it", () => {
  const forecasts: Cell[] = [
    { salesRowId: "r2", month: JAN, amount: 400 },
    { salesRowId: "r2", month: FEB, amount: 400 },
    { salesRowId: "r2", month: MAR, amount: 400 },
  ];
  const actuals = [cell("r2", JAN, 350, "monthly")];

  // January: they expected £400 and £350 landed. Both true, neither
  // worked out from the other.
  assert.equal(forecastIn(forecasts, JAN), 400);
  assert.equal(receivedIn(actuals, JAN), 350);

  // February is forecast and not yet received, which is a forecast with a
  // dash beside it rather than a figure of zero.
  assert.equal(forecastIn(forecasts, FEB), 400);
  assert.equal(receivedIn(actuals, FEB), null);

  assert.deepEqual(forecastAfter(forecasts, JAN), [
    { month: FEB, amount: 400 },
    { month: MAR, amount: 400 },
  ]);
  assert.deepEqual(forecastAfter(forecasts, MAR), [], "nothing after the last one");
});

test("THE POINT: one-off in January, retainer from April, same row", () => {
  // Dom, 13 November. Recurrence is on the cell, not the row, so this
  // needs no unpublish and no second row — and January's MRR stays what
  // January's report said it was.
  const actuals = [
    cell("r2", JAN, 1200, "none"),
    cell("r2", APR, 400, "monthly"),
  ];

  assert.equal(recurringSplit(actuals, JAN).combined, null, "January was a one-off");
  assert.equal(recurringSplit(actuals, APR).monthly, 400, "and April is a retainer");
  assert.equal(receivedIn(actuals, JAN), 1200, "both months still count as money in");
});

test("recurring comes out in her three lines", () => {
  const actuals = [
    cell("r1", JAN, 1200, "none"),
    cell("r2", JAN, 400, "monthly"),
    cell("r3", JAN, 1800, "annual"),
  ];

  const split = recurringSplit(actuals, JAN);
  assert.equal(split.monthly, 400);
  assert.equal(split.annual, 1800);
  assert.equal(split.combined, 2200, "the two together");
  assert.equal(split.combined, split.monthly! + split.annual!);

  // The one-off is in the month's money and in none of the three.
  assert.equal(receivedIn(actuals, JAN), 3400);

  assert.deepEqual(recurringSplit(actuals, FEB), {
    monthly: null,
    annual: null,
    combined: null,
  });
});

test("a linked row feeds the Offers charts; an unlinked one is bespoke", () => {
  const actuals = [
    cell("r1", JAN, 500),
    cell("r2", JAN, 800, "monthly"),
    cell("r3", JAN, 400),
  ];

  assert.deepEqual([...offerRevenue(rows, actuals, JAN)], [["offer-1", 500]]);

  // One slice, with its count — not two, and not forty for an agency.
  assert.deepEqual(bespokeRevenue(rows, actuals, JAN), { total: 1200, clients: 2 });
});

test("costs come out as the four buckets the report already has", () => {
  const expenses: ExpenseRow[] = [
    { categoryId: "c1", bucket: "fixed", month: JAN, amount: 120 },
    { categoryId: "c2", bucket: "fixed", month: JAN, amount: 80 },
    { categoryId: "c3", bucket: "team", month: JAN, amount: 2400 },
    { categoryId: "c4", bucket: "variable", month: FEB, amount: 50 },
  ];
  const costs = costsByBucket(expenses, JAN);
  assert.equal(costs.fixed, 200, "two categories in one bucket");
  assert.equal(costs.team, 2400);
  assert.equal(costs.variable, null, "February's is February's");
  assert.equal(costs.investment, null, "a bucket nobody used is a dash");
});

test("per-client profitability is what they paid against what they cost", () => {
  const actuals = [cell("r2", JAN, 1000, "monthly"), cell("r3", JAN, 500)];
  const hours = [
    { salesRowId: "r2", month: JAN, hours: 10, rateUsed: 30 },
    { salesRowId: "r2", month: JAN, hours: 4, rateUsed: 55 },
    { salesRowId: "r3", month: JAN, hours: 20, rateUsed: 30 },
  ];

  const [best, worst] = clientProfitability(rows, actuals, hours, JAN);

  // £1,000 in, 14 hours at two different rates = £520, so £480 left.
  assert.equal(best.name, "A retainer client");
  assert.equal(best.paid, 1000);
  assert.equal(best.hours, 14);
  assert.equal(best.staffCost, 520);
  assert.equal(best.profit, 480);
  assert.equal(Math.round(best.margin!), 48);

  // £500 in, 20 hours at £30 = £600. The retainer that is quietly costing
  // money, which is the whole reason the tab exists.
  assert.equal(worst.profit, -100);
  assert.ok(best.profit! > worst.profit!, "sorted, so the one to worry about is last");
});

test("an offer row never appears on the per-client card", () => {
  // Its hours belong to the Offers screen, and asking twice is how two
  // answers to one question get stored.
  assert.deepEqual(clientProfitability(rows, [cell("r1", JAN, 500)], [], JAN), []);
});

test("a client who paid with nobody's hours against them keeps all of it", () => {
  const [only] = clientProfitability(rows, [cell("r2", JAN, 900, "monthly")], [], JAN);
  assert.equal(only.staffCost, null, "no hours is not zero hours");
  assert.equal(only.profit, 900, "but the profit is real, and it is all of it");
});

test("a client who was quiet this month is not on this month's card", () => {
  assert.deepEqual(
    clientProfitability(rows, [cell("r2", JAN, 900, "monthly")], [], FEB),
    [],
    "a quiet row is not a profit of zero",
  );
});

test("a row shows in the year's grid when it has a figure in either grid", () => {
  // Retiring a row is gone (Nina, 13 November), so this is what stops
  // three years of former clients filling the screen.
  const actuals = [cell("r1", JAN, 500)];
  const forecasts: Cell[] = [{ salesRowId: "r2", month: MAR, amount: 400 }];

  assert.deepEqual(
    rowsWithFigures(rows, actuals, forecasts, "2026").map((r) => r.id),
    ["r1", "r2", "r3"],
    "actual on one, forecast on the other, and r3 has nothing anywhere yet",
  );
  // r3 has nothing anywhere: a row somebody has just added, not a client
  // who left, so hiding it would read as the add having failed.
  assert.ok(
    rowsWithFigures(rows, actuals, forecasts, "2026").some((r) => r.id === "r3"),
    "a row with no figures at all is always shown",
  );

  assert.deepEqual(
    rowsWithFigures(rows, actuals, forecasts, "2025").map((r) => r.id),
    ["r3"],
    "last year's figures do not keep a row on this year's grid, but an empty one stays",
  );
});

test("the grid shows what is filled, the month being entered, and three ahead", () => {
  const filled: Cell[] = [
    { salesRowId: "r1", month: JAN, amount: 500 },
    { salesRowId: "r1", month: FEB, amount: 500 },
  ];

  assert.deepEqual(monthsToShow(YEAR, filled, FEB), [
    JAN,
    FEB,
    MAR,
    APR,
    "2026-05-01",
  ]);

  // Nothing typed yet: the month being entered, and three to type into.
  assert.deepEqual(monthsToShow(YEAR, [], JAN), [JAN, FEB, MAR, APR]);

  // A figure late in the year keeps every month up to it, so nothing
  // already entered is ever hidden.
  const late: Cell[] = [{ salesRowId: "r1", month: "2026-11-01", amount: 1 }];
  const shown = monthsToShow(YEAR, late, JAN);
  assert.ok(shown.includes("2026-11-01"), "the filled one");
  assert.ok(shown.includes("2026-12-01"), "and the months after it, up to three");
  assert.ok(!shown.includes("2026-05-01"), "but not the empty ones in between");
});
