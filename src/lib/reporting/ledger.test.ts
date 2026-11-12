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
  type Sale,
  type SalePayment,
  type SalesRow,
} from "./ledger.ts";

/**
 * The arithmetic of the Financials ledger.
 *
 * The case the whole thing turns on is the first one: £2,000 sold in
 * September, paid in four instalments. Sales and cash answer
 * differently, and both are right.
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

/** £2,000 sold in September. Four £500s is a payment plan, not recurrence. */
const course: Sale = {
  id: "s1",
  salesRowId: "r1",
  month: SEP,
  totalValue: 2000,
  billing: "one_off",
  cancelledOn: null,
};

const plan: SalePayment[] = [
  { saleId: "s1", dueMonth: SEP, receivedMonth: SEP, amount: 500, cancelledOn: null },
  { saleId: "s1", dueMonth: OCT, receivedMonth: OCT, amount: 500, cancelledOn: null },
  { saleId: "s1", dueMonth: NOV, receivedMonth: DEC, amount: 500, cancelledOn: null },
  { saleId: "s1", dueMonth: DEC, receivedMonth: null, amount: 500, cancelledOn: null },
];

test("a sale counts in full the month it was sold; cash counts as it arrives", () => {
  // The whole £2,000 in September, because that is when they sold it.
  assert.equal(salesIn([course], SEP), 2000);
  assert.equal(cashIn(plan, SEP), 500);

  // Nothing new was sold after that. A dash, not £0 — not selling
  // anything is not the same as selling nothing.
  assert.equal(salesIn([course], OCT), null);
  assert.equal(cashIn(plan, OCT), 500);

  // November's instalment was due in November and arrived in December,
  // so November sees no money and December sees two instalments.
  assert.equal(salesIn([course], NOV), null);
  assert.equal(cashIn(plan, NOV), null);
  assert.equal(salesIn([course], DEC), null);
  // November's £500, arriving late. December's own has not been paid at
  // all yet, which is why this is £500 and not £1,000.
  assert.equal(cashIn(plan, DEC), 500);
});

test("money due and not in is outstanding as of that month, not as of today", () => {
  assert.equal(outstandingBy(plan, NOV), 500, "November's, still unpaid then");
  assert.equal(outstandingBy(plan, DEC), 500, "December's, by the end of December");
  assert.equal(outstandingBy(plan, SEP), null, "nothing was late in September");
});

test("what is already scheduled into later months", () => {
  assert.deepEqual(scheduledAfter(plan, OCT), [
    { month: NOV, amount: 500 },
    { month: DEC, amount: 500 },
  ]);
  assert.deepEqual(scheduledAfter(plan, DEC), [], "nothing after the last instalment");
});

test("a cancelled sale and a cancelled instalment stop counting, and stay", () => {
  const fell: Sale = { ...course, id: "s2", cancelledOn: "2026-09-20" };
  assert.equal(salesIn([fell], SEP), null, "a sale that fell through is not revenue");
  assert.equal(
    salesIn([course, fell], SEP),
    2000,
    "and it does not drag down the one that stood",
  );

  const stopped = plan.map((p, i) => (i === 3 ? { ...p, cancelledOn: "2026-11-30" } : p));
  assert.equal(outstandingBy(stopped, DEC), null, "a cancelled instalment is not owed");
  assert.deepEqual(scheduledAfter(stopped, NOV), [], "nor scheduled");
});

test("a cancellation counts from its own month, so a published September stands", () => {
  // Dom, 12 November. The guard now lets a September sale be cancelled in
  // November without September being unpublished — and if this file simply
  // dropped every cancelled row, that cancellation would blank £2,000 out
  // of a report the client had already read.
  const stopped: Sale = { ...course, cancelledOn: "2026-11-14" };
  const stoppedPlan = plan.map((p) =>
    p.dueMonth === NOV || p.dueMonth === DEC ? { ...p, cancelledOn: "2026-11-14" } : p,
  );

  assert.equal(salesIn([stopped], SEP), 2000, "September sold it, and that is permanent");
  assert.equal(cashIn(stoppedPlan, SEP), 500, "and the money that came in really came in");

  // An invoice still owed in September is still owed in September. This is
  // the case that forces the whole rule: applied flatly, a November
  // cancellation would wipe a published month's outstanding figure.
  const owed: SalePayment[] = [
    { saleId: "s1", dueMonth: SEP, receivedMonth: null, amount: 800, cancelledOn: "2026-11-14" },
  ];
  assert.equal(outstandingBy(owed, SEP), 800, "September's report said £800 was owed");
  assert.equal(outstandingBy(owed, NOV), null, "and from November it is not owed, it is gone");

  // A retainer that stops in November is in October's MRR and out of
  // November's.
  const retainer: Sale = {
    id: "s9",
    salesRowId: "r2",
    month: SEP,
    totalValue: 300,
    billing: "monthly",
    cancelledOn: "2026-11-14",
  };
  const dues: SalePayment[] = [
    { saleId: "s9", dueMonth: OCT, receivedMonth: OCT, amount: 300, cancelledOn: null },
    { saleId: "s9", dueMonth: NOV, receivedMonth: null, amount: 300, cancelledOn: null },
  ];
  assert.equal(recurringSplit([retainer], dues, OCT).monthly, 300);
  assert.equal(recurringSplit([retainer], dues, NOV).monthly, null, "they left");

  // Scheduled-ahead is the exception: it is about the future rather than
  // about a month, so it drops a cancelled instalment at once. What holds
  // a published month still there is the freeze, not this function.
  assert.deepEqual(scheduledAfter(stoppedPlan, OCT), [], "nothing left to collect");
});

test("MRR is drawn from how the sale is billed, so retainers are in it", () => {
  // The fix: MRR used to mean "revenue on offers marked recurring",
  // which dropped every retainer client on the floor.
  const sales: Sale[] = [
    course,
    { id: "s3", salesRowId: "r2", month: SEP, totalValue: 300, billing: "monthly", cancelledOn: null },
    { id: "s4", salesRowId: "r3", month: SEP, totalValue: 1200, billing: "annual", cancelledOn: null },
  ];
  const payments: SalePayment[] = [
    { saleId: "s1", dueMonth: SEP, receivedMonth: SEP, amount: 500, cancelledOn: null },
    { saleId: "s3", dueMonth: SEP, receivedMonth: SEP, amount: 300, cancelledOn: null },
    { saleId: "s4", dueMonth: SEP, receivedMonth: SEP, amount: 1200, cancelledOn: null },
  ];

  const split = recurringSplit(sales, payments, SEP);
  assert.equal(split.monthly, 300, "the retainer");
  assert.equal(split.annual, 1200, "the one paid yearly");
  assert.equal(split.combined, 1500);
  // The course's £500 instalment is not in any of the three, however
  // regular it looks: a payment plan is a way of paying, not a way of
  // being sold again next month.
  assert.equal(split.combined, split.monthly! + split.annual!);

  const quiet = recurringSplit(sales, payments, OCT);
  assert.deepEqual(quiet, { monthly: null, annual: null, combined: null });
});

test("an offer-linked row still feeds the Offers charts; an unlinked one is bespoke", () => {
  const sales: Sale[] = [
    { id: "a", salesRowId: "r1", month: SEP, totalValue: 500, billing: "one_off", cancelledOn: null },
    { id: "b", salesRowId: "r2", month: SEP, totalValue: 800, billing: "monthly", cancelledOn: null },
    { id: "c", salesRowId: "r3", month: SEP, totalValue: 400, billing: "monthly", cancelledOn: null },
  ];

  assert.deepEqual([...offerRevenue(rows, sales, SEP)], [["offer-1", 500]]);

  // One slice, with its count — not two, and not forty for an agency.
  // The donut still totals the month's revenue, which is what stops it
  // disagreeing with the Financials page.
  assert.deepEqual(bespokeRevenue(rows, sales, SEP), { total: 1200, clients: 2 });
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
  const sales: Sale[] = [
    { id: "b", salesRowId: "r2", month: SEP, totalValue: 1000, billing: "monthly", cancelledOn: null },
    { id: "c", salesRowId: "r3", month: SEP, totalValue: 500, billing: "monthly", cancelledOn: null },
  ];
  const payments: SalePayment[] = [
    { saleId: "b", dueMonth: SEP, receivedMonth: SEP, amount: 1000, cancelledOn: null },
    { saleId: "c", dueMonth: SEP, receivedMonth: SEP, amount: 500, cancelledOn: null },
  ];
  const hours = [
    { salesRowId: "r2", month: SEP, hours: 10, rateUsed: 30 },
    { salesRowId: "r2", month: SEP, hours: 4, rateUsed: 55 },
    { salesRowId: "r3", month: SEP, hours: 20, rateUsed: 30 },
  ];

  const [best, worst] = clientProfitability(rows, sales, payments, hours, SEP);

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
  assert.ok(best.profit! > worst.profit!, "sorted, so the one to worry about is last");
});

test("an offer row never appears on the per-client card", () => {
  // Its hours belong to the Offers screen, and asking twice is how two
  // answers to one question get stored.
  const payments: SalePayment[] = [
    { saleId: "s1", dueMonth: SEP, receivedMonth: SEP, amount: 500, cancelledOn: null },
  ];
  assert.deepEqual(clientProfitability(rows, [course], payments, [], SEP), []);
});

test("a client who paid with nobody's hours against them keeps all of it", () => {
  const sales: Sale[] = [
    { id: "b", salesRowId: "r2", month: SEP, totalValue: 900, billing: "monthly", cancelledOn: null },
  ];
  const payments: SalePayment[] = [
    { saleId: "b", dueMonth: SEP, receivedMonth: SEP, amount: 900, cancelledOn: null },
  ];
  const [only] = clientProfitability(rows, sales, payments, [], SEP);
  assert.equal(only.staffCost, null, "no hours is not zero hours");
  assert.equal(only.profit, 900, "but the profit is real, and it is all of it");
});

test("a client who was quiet this month is not on this month's card", () => {
  const sales: Sale[] = [
    { id: "b", salesRowId: "r2", month: SEP, totalValue: 900, billing: "monthly", cancelledOn: null },
  ];
  const payments: SalePayment[] = [
    { saleId: "b", dueMonth: SEP, receivedMonth: SEP, amount: 900, cancelledOn: null },
  ];
  assert.deepEqual(
    clientProfitability(rows, sales, payments, [], OCT),
    [],
    "a quiet row is not a profit of zero",
  );
});
