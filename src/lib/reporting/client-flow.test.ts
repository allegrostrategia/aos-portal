import assert from "node:assert/strict";
import { test } from "node:test";

import { activeClientsAtStart, openingFigures, type MonthFlow } from "./client-flow.ts";

/**
 * §5.8's opening figure, and the chain that hangs off it.
 *
 * Four figures depend on "active clients at start" — retention, churn,
 * upsell and active at end — and before this they were null on every month
 * of every client, because the metric is `pulled` and so can never be
 * typed, and the first month has nothing to pull from.
 */

const JAN = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";
const APR = "2026-04-01";

const flow: MonthFlow[] = [
  { month: JAN, opening: 10, newClients: 3, clientsWhoLeft: 1 },
  { month: FEB, newClients: 2, clientsWhoLeft: 0 },
  { month: MAR, newClients: 1, clientsWhoLeft: 4 },
];

test("the first month is the figure that was typed", () => {
  assert.equal(activeClientsAtStart(flow, JAN), 10);
});

test("every later month carries on from the month before", () => {
  assert.equal(activeClientsAtStart(flow, FEB), 12, "10 + 3 − 1");
  assert.equal(activeClientsAtStart(flow, MAR), 14, "and + 2 − 0");
  assert.equal(activeClientsAtStart(flow, APR), 11, "and + 1 − 4");
});

test("a month before the opening figure has no answer", () => {
  // Not zero. "We do not know" and "nobody" are different, and §4 is
  // explicit that a dash is the first of those.
  assert.equal(activeClientsAtStart(flow, "2025-12-01"), null);
});

test("no opening figure at all is a dash, not a guess", () => {
  assert.equal(
    activeClientsAtStart([{ month: JAN, newClients: 3, clientsWhoLeft: 1 }], FEB),
    null,
  );
});

test("a month with nothing entered does not break the chain", () => {
  // One forgotten field should not turn every later month's retention into
  // a dash. The carried figure is on screen, so a wrong one is visible.
  const gappy: MonthFlow[] = [
    { month: JAN, opening: 10, newClients: 3, clientsWhoLeft: 1 },
    { month: FEB },
    { month: MAR, newClients: 5, clientsWhoLeft: 0 },
  ];
  assert.equal(activeClientsAtStart(gappy, MAR), 12);
  assert.equal(activeClientsAtStart(gappy, APR), 17);
});

test("the earliest opening figure is the one in use, and the rest are named", () => {
  // Dom's rule, 5 Oct: earliest stored, not the workspace's first month, so
  // moving the first month cannot silently blank the chain.
  const two: MonthFlow[] = [
    { month: FEB, opening: 40, newClients: 0, clientsWhoLeft: 0 },
    { month: JAN, opening: 10, newClients: 3, clientsWhoLeft: 1 },
  ];
  const { inUse, unused } = openingFigures(two);

  assert.deepEqual(inUse, { month: JAN, value: 10 });
  assert.deepEqual(unused, [{ month: FEB, value: 40 }], "named, not silently dropped");
  assert.equal(activeClientsAtStart(two, FEB), 12, "and February carries on from January");
});

test("a second opening figure does not quietly take over", () => {
  const two: MonthFlow[] = [
    { month: JAN, opening: 10, newClients: 0, clientsWhoLeft: 0 },
    { month: FEB, opening: 999, newClients: 0, clientsWhoLeft: 0 },
  ];
  assert.equal(activeClientsAtStart(two, MAR), 10, "999 is ignored, and said to be ignored");
  assert.equal(openingFigures(two).unused.length, 1);
});

test("zero is an opening figure, and null is not", () => {
  // A business that joined with no clients typed 0, and it must survive
  // every falsy check between here and the screen.
  assert.deepEqual(openingFigures([{ month: JAN, opening: 0 }]).inUse, {
    month: JAN,
    value: 0,
  });
  assert.equal(activeClientsAtStart([{ month: JAN, opening: 0, newClients: 4 }], FEB), 4);

  assert.equal(openingFigures([{ month: JAN, opening: null }]).inUse, null);
});
