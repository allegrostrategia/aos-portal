import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmedRecurring } from "./ledger.ts";

/**
 * "Confirmed recurring revenue", four months of it.
 *
 * The figure it replaces was this month's recurring total — true, and
 * unplaceable in time. These tests are about the two things that make
 * the new one mean something: only recurring rows count, and the
 * current month prefers what actually landed.
 */

const rows = [
  { id: "retainer-a", recurrence: "monthly" as const },
  { id: "retainer-b", recurrence: "monthly" as const },
  { id: "one-off", recurrence: "none" as const },
];

const cell = (salesRowId: string, month: string, amount: number) => ({ salesRowId, month, amount });
const actual = (salesRowId: string, month: string, amount: number, recurrence: "monthly" | "none" = "monthly") =>
  ({ salesRowId, month, amount, recurrence });

test("four months, this one and the three after it", () => {
  const forecasts = [
    cell("retainer-a", "2026-11-01", 1000), cell("retainer-a", "2026-12-01", 1000),
    cell("retainer-a", "2027-01-01", 1000), cell("retainer-a", "2027-02-01", 1000),
  ];
  const out = confirmedRecurring(rows, forecasts, [], "2026-11-01");
  assert.deepEqual(out.map((r) => r.month), [
    "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01",
  ]);
});

test("a one-off pencilled in is a hope, not confirmed revenue", () => {
  const forecasts = [
    cell("retainer-a", "2026-12-01", 1000),
    cell("one-off", "2026-12-01", 9999),
  ];
  const out = confirmedRecurring(rows, forecasts, [], "2026-11-01");
  assert.equal(out.find((r) => r.month === "2026-12-01")?.amount, 1000);
});

test("the current month prefers what landed over what was forecast", () => {
  // A forecast for a month that is over is the stale number of the two.
  const forecasts = [cell("retainer-a", "2026-11-01", 1000)];
  const actuals = [actual("retainer-a", "2026-11-01", 1200)];
  const out = confirmedRecurring(rows, forecasts, actuals, "2026-11-01");
  assert.equal(out[0].amount, 1200);
});

test("nothing landed yet, so the current month still shows the forecast", () => {
  const forecasts = [cell("retainer-a", "2026-11-01", 1000)];
  const out = confirmedRecurring(rows, forecasts, [], "2026-11-01");
  assert.equal(out[0].amount, 1000);
});

test("a one-off that landed this month is not recurring revenue", () => {
  const actuals = [actual("one-off", "2026-11-01", 5000, "none")];
  const out = confirmedRecurring(rows, [], actuals, "2026-11-01");
  // Null, not 0: the £5,000 is excluded, and nothing recurring has been
  // forecast for the month either, so there is no figure to give. It read
  // 0 until 17 November, which drew a bar at the floor — and "£0" on a
  // recurring-revenue chart says the retainers have ended.
  assert.equal(out[0].amount, null);
});

test("a forecast somebody typed as zero keeps its zero", () => {
  // The distinction the null is for. An empty month is nobody having got
  // to it; a month with a cell holding 0 is somebody saying so, and
  // turning that into "nothing forecast yet" would lose a real answer.
  const out = confirmedRecurring(rows, [cell("retainer-a", "2026-12-01", 0)], [], "2026-11-01");
  assert.equal(out.find((r) => r.month === "2026-12-01")?.amount, 0);
  assert.equal(
    out.find((r) => r.month === "2027-01-01")?.amount,
    null,
    "and the month after it, which has no cell at all, is still null",
  );
});

test("no recurring rows at all is nothing to draw, not four zeroes", () => {
  const out = confirmedRecurring([{ id: "one-off", recurrence: "none" }], [], [], "2026-11-01");
  assert.deepEqual(out, []);
});

test("both retainers add up", () => {
  const forecasts = [cell("retainer-a", "2026-12-01", 1000), cell("retainer-b", "2026-12-01", 750)];
  const out = confirmedRecurring(rows, forecasts, [], "2026-11-01");
  assert.equal(out.find((r) => r.month === "2026-12-01")?.amount, 1750);
});

test("it crosses a year boundary without losing a month", () => {
  const out = confirmedRecurring(rows, [], [], "2026-12-01");
  assert.deepEqual(out.map((r) => r.month), [
    "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01",
  ]);
});
