import test from "node:test";
import assert from "node:assert/strict";

import {
  bespokeRevenue,
  cashIn,
  clientProfitability,
  costsByBucket,
  offerRevenue,
  outstandingBy,
  recurringSplit,
  salesIn,
  scheduledAfter,
  type ExpenseRow,
  type SalePayment,
  type SalesRow,
} from "./ledger.ts";

/**
 * The arithmetic of the Financials ledger.
 *
 * The case the whole thing turns on is the first one: £2,000 sold in
 * September as £500 now and three more, one of which arrives late. Sales
 * and cash answer differently, and both are right.
 */

const SEP = "2026-09-01";
const OCT = "2026-10-01";
const NOV = "2026-11-01";
const DEC = "2026-12-01";

const rows: SalesRow[] = [
  { id: "r1", name: "Signature programme", rowType: "offer", offerEntityId: "offer-1", active: true },
  { id: "r2", name: "A retainer client", rowType: "client", offerEntityId: null, active: true },
  { id: "r3", name: "Another retainer client", rowType: "client", offerEntityId: null, active: true },
];

/** £2,000 sold in September, paid £500 a month — November's arrived late. */
const plan: SalePayment[] = [
  { salesRowId: "r1", dueMonth: SEP, receivedMonth: SEP, amount: 500, isAnnual: false },
  { salesRowId: "r1", dueMonth: OCT, receivedMonth: OCT, amount: 500, isAnnual: false },
  { salesRowId: "r1", dueMonth: NOV, receivedMonth: DEC, amount: 500, isAnnual: false },
  { salesRowId: "r1", dueMonth: DEC, receivedMonth: null, amount: 500, isAnnual: false },
];

test("a sale counts when it was sold and the cash counts when it arrived", () => {
  assert.equal(salesIn(plan, SEP), 500, "September was owed £500 of the plan");
  assert.equal(cashIn(plan, SEP), 500);

  // The one that matters: November's £500 was due in November and paid
  // in December. November has a sale and no cash; December has cash for
  // a sale that was not its own.
  assert.equal(salesIn(plan, NOV), 500, "November sold it");
  assert.equal(cashIn(plan, NOV), null, "and saw none of the money");
  assert.equal(salesIn(plan, DEC), 500, "December's own instalment");
  assert.equal(cashIn(plan, DEC), 500, "and November's money, arriving late");
});

test("money due and not in is outstanding as of that month, not as of today", () => {
  // Asked as of November: three instalments were due by then and one of
  // them has not been paid.
  assert.equal(outstandingBy(plan, NOV), 500);
  // Asked as of December: November's arrived, December's has not.
  assert.equal(outstandingBy(plan, DEC), 500);
  assert.equal(outstandingBy(plan, SEP), null, "nothing was late in September");
});

test("what is already scheduled into later months", () => {
  assert.deepEqual(scheduledAfter(plan, OCT), [
    { month: NOV, amount: 500 },
    { month: DEC, amount: 500 },
  ]);
  assert.deepEqual(scheduledAfter(plan, DEC), [], "nothing after the last instalment");
});

test("monthly, annual and combined, which is her Recurring Revenue tab", () => {
  const mixed: SalePayment[] = [
    { salesRowId: "r2", dueMonth: SEP, receivedMonth: SEP, amount: 300, isAnnual: false },
    { salesRowId: "r3", dueMonth: SEP, receivedMonth: SEP, amount: 1200, isAnnual: true },
  ];
  const split = recurringSplit(mixed, SEP);
  assert.equal(split.monthly, 300);
  assert.equal(split.annual, 1200);
  assert.equal(split.combined, 1500);

  const none = recurringSplit(mixed, OCT);
  assert.deepEqual(none, { monthly: null, annual: null, combined: null }, "a quiet month is dashes, not zeroes");
});

test("an offer-linked row still feeds the Offers charts; an unlinked one is bespoke", () => {
  const payments: SalePayment[] = [
    { salesRowId: "r1", dueMonth: SEP, receivedMonth: SEP, amount: 500, isAnnual: false },
    { salesRowId: "r2", dueMonth: SEP, receivedMonth: null, amount: 800, isAnnual: false },
    { salesRowId: "r3", dueMonth: SEP, receivedMonth: SEP, amount: 400, isAnnual: false },
  ];

  assert.deepEqual([...offerRevenue(rows, payments, SEP)], [["offer-1", 500]]);

  // One slice, with its count — not two slices, and not forty for an
  // agency. The donut still totals the month's revenue, which is what
  // stops it disagreeing with the Financials page.
  assert.deepEqual(bespokeRevenue(rows, payments, SEP), { total: 1200, clients: 2 });
});

test("costs come out as the four buckets the report already has", () => {
  const expenses: ExpenseRow[] = [
    { categoryId: "c1", bucket: "fixed", month: SEP, amount: 120 },
    { categoryId: "c2", bucket: "fixed", month: SEP, amount: 80 },
    { categoryId: "c3", bucket: "team", month: SEP, amount: 2400 },
    { categoryId: "c4", bucket: "variable", month: OCT, amount: 50 },
  ];
  const costs = costsByBucket(expenses, SEP);
  assert.equal(costs.fixed, 200, "two categories in one bucket");
  assert.equal(costs.team, 2400);
  assert.equal(costs.variable, null, "October's is October's");
  assert.equal(costs.investment, null, "a bucket nobody used is a dash");
});

test("per-client profitability is what they paid against what they cost", () => {
  const payments: SalePayment[] = [
    { salesRowId: "r2", dueMonth: SEP, receivedMonth: SEP, amount: 1000, isAnnual: false },
    { salesRowId: "r3", dueMonth: SEP, receivedMonth: SEP, amount: 500, isAnnual: false },
  ];
  const hours = [
    { salesRowId: "r2", month: SEP, hours: 10, rateUsed: 30 },
    { salesRowId: "r2", month: SEP, hours: 4, rateUsed: 55 },
    { salesRowId: "r3", month: SEP, hours: 20, rateUsed: 30 },
  ];

  const [best, worst] = clientProfitability(rows, payments, hours, SEP);

  // £1,000 paid, 14 hours at two different rates = £520, so £480 left.
  assert.equal(best.name, "A retainer client");
  assert.equal(best.paid, 1000);
  assert.equal(best.hours, 14);
  assert.equal(best.staffCost, 520);
  assert.equal(best.profit, 480);
  assert.equal(Math.round(best.margin!), 48);

  // £500 paid, 20 hours at £30 = £600. The retainer that is quietly
  // costing money, which is the whole reason the tab exists.
  assert.equal(worst.profit, -100);

  // Sorted by profit, so the one to worry about is at the bottom.
  assert.ok(best.profit! > worst.profit!);
});

test("an offer row never appears on the per-client card", () => {
  // Its hours belong to the Offers screen, and asking twice is how two
  // answers to one question get stored.
  const payments: SalePayment[] = [
    { salesRowId: "r1", dueMonth: SEP, receivedMonth: SEP, amount: 500, isAnnual: false },
  ];
  assert.deepEqual(clientProfitability(rows, payments, [], SEP), []);
});

test("a client who paid with nobody's hours against them keeps all of it", () => {
  const payments: SalePayment[] = [
    { salesRowId: "r2", dueMonth: SEP, receivedMonth: SEP, amount: 900, isAnnual: false },
  ];
  const [only] = clientProfitability(rows, payments, [], SEP);
  assert.equal(only.staffCost, null, "no hours is not zero hours");
  assert.equal(only.profit, 900, "but the profit is real, and it is all of it");
});

test("a client who was quiet this month is not on this month's card", () => {
  const payments: SalePayment[] = [
    { salesRowId: "r2", dueMonth: SEP, receivedMonth: SEP, amount: 900, isAnnual: false },
  ];
  const card = clientProfitability(rows, payments, [], OCT);
  assert.deepEqual(card, [], "a quiet row is not a profit of zero");
});
