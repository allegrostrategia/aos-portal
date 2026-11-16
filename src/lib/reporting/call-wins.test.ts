import assert from "node:assert/strict";
import { test } from "node:test";

import { leads } from "./formulas.ts";
import { calculate } from "./calculate.ts";
import {
  BESPOKE_ID,
  callWinRows,
  callWinTotals,
} from "./call-wins.ts";
import { callFunnel, winsByOffer } from "./chart-data.ts";
import type { CallWin } from "./formulas.ts";
import type { MonthFigures } from "./month-figures.ts";

/**
 * What the calls turned into (§5.6, Nina 16 November; Dom's three changes
 * the same day).
 *
 * Four things are worth a test rather than a reading: the funnel's last step
 * is calls converted and not new clients, the close rate is measured on the
 * same figure the funnel's last step shows, an offer with no price is a dash
 * rather than £0, and the bespoke line counts in every total.
 */

const WINS: CallWin[] = [
  { id: "a", name: "Mastermind", price: 4000, salesFromCalls: 2 },
  { id: "b", name: "Power hour", price: 150, salesFromCalls: 6 },
  // Sold, and nothing to value it at. It earned something; we have no price
  // to say what — the dash rule, not a zero.
  { id: "c", name: "Bespoke day", price: null, salesFromCalls: 1 },
];

const NO_BESPOKE = { sales: null, value: null };

function figuresFrom(
  callWins: CallWin[],
  monthly: Record<string, number | null> = {},
  bespokeWins = NO_BESPOKE,
): MonthFigures {
  return {
    callWins,
    bespokeWins,
    figure: (key: string) => monthly[key] ?? null,
    previousFigure: () => null,
    results: {},
    previousResults: {},
    byKey: new Map(),
  } as unknown as MonthFigures;
}

test("the value of a sale is sales × the offer's price, and a dash without one", () => {
  assert.equal(leads.valueOfSales(2, 4000), 8000);
  assert.equal(leads.valueOfSales(0, 4000), 0, "a genuine zero is an answer");
  assert.equal(leads.valueOfSales(1, null), null, "no price is not £0");
  assert.equal(leads.valueOfSales(null, 4000), null, "no sales entered is not £0");
});

test("the breakdown uses the formula module's own numbers", () => {
  const rows = callWinRows(WINS, NO_BESPOKE);
  for (const win of WINS) {
    const row = rows.find((r) => r.id === win.id);
    assert.ok(row, `${win.name} has a row`);
    assert.equal(
      row.value,
      leads.valueOfSales(win.salesFromCalls, win.price),
      `${win.name}: the row must be what leads.valueOfSales says`,
    );
  }
});

test("the bespoke line is last, and counts in both totals", () => {
  const rows = callWinRows(WINS, { sales: 2, value: 7400 });

  assert.equal(rows.at(-1)?.id, BESPOKE_ID, "never ranked among the offers");
  assert.equal(rows.at(-1)?.price, null, "priced per job, so there is no each-price");

  const { sales, value, unpriced } = callWinTotals(rows);
  assert.equal(sales, 2 + 6 + 1 + 2, "every line's sales, bespoke included");
  // 2 × £4,000 + 6 × £150 + (no price) + £7,400 typed.
  assert.equal(value, 8000 + 900 + 7400);
  assert.equal(unpriced, 1, "the offer with no price, not the bespoke line");
});

test("a bespoke value with no count still makes a line", () => {
  // The two are entered separately and somebody will fill one first. A
  // value with no count is still £X the month won, and dropping the row
  // would lose it out of the total with nothing on screen to say so.
  const rows = callWinRows([], { sales: null, value: 3200 });
  assert.equal(rows.length, 1);
  assert.equal(callWinTotals(rows).value, 3200);
  assert.equal(callWinTotals(rows).sales, 0);
});

test("nothing entered anywhere is no rows at all", () => {
  assert.deepEqual(callWinRows([], NO_BESPOKE), []);
  assert.deepEqual(
    callWinRows([{ id: "a", name: "Mastermind", price: 4000, salesFromCalls: null }], NO_BESPOKE),
    [],
  );
});

test("the funnel's last step is calls converted, never new clients", () => {
  const stages = callFunnel(
    figuresFrom(WINS, {
      leads_conversions_total_leads: 220,
      leads_conversions_calls_booked: 24,
      leads_conversions_calls_held: 18,
      leads_conversions_calls_converted: 7,
      // Higher on purpose: somebody who bought without ever being on a
      // call. Reading this into the funnel would draw a bottom step wider
      // than the one above it, which is the shape saying something untrue.
      leads_conversions_new_clients: 9,
    }),
  );

  assert.deepEqual(
    stages.map((s) => [s.label, s.value]),
    [
      ["Leads", 220],
      ["Calls booked", 24],
      ["Calls held", 18],
      ["Won", 7],
    ],
  );
});

test("a step nobody entered is listed, not drawn as a zero", () => {
  const stages = callFunnel(figuresFrom([], { leads_conversions_total_leads: 40 }));
  assert.equal(stages[0].value, 40);
  for (const stage of stages.slice(1)) {
    assert.equal(stage.value, null, `${stage.label} was not entered`);
  }
});

/**
 * Dom, 16 November: "The funnel's Won and the close rate must never
 * disagree on the same page."
 */
test("the close rate is measured on the figure the funnel's last step shows", () => {
  const values: Record<string, number | null> = {
    leads_conversions_calls_held: 18,
    leads_conversions_calls_converted: 7,
    leads_conversions_new_clients: 9,
  };
  const results = calculate("leads_conversions", {
    value: (key) => values[key] ?? null,
    previous: () => null,
  });

  // 7 ÷ 18, not 9 ÷ 18 — which would be 50% against a funnel showing 7.
  assert.equal(Number(results.leads_conversions_close_rate?.toFixed(1)), 38.9);
});

test("and a month with no converted figure keeps the rate it was sent with", () => {
  // Every month published before 16 November holds no converted figure,
  // because the metric did not exist. This is the branch that means a
  // report already in a client's inbox prints what it always printed.
  const values: Record<string, number | null> = {
    leads_conversions_calls_held: 18,
    leads_conversions_new_clients: 9,
  };
  const results = calculate("leads_conversions", {
    value: (key) => values[key] ?? null,
    previous: () => null,
  });

  assert.equal(results.leads_conversions_close_rate, 50);
});

test("the bars rank by value and keep each line's own colour", () => {
  const bars = winsByOffer(figuresFrom(WINS, {}, { sales: 1, value: 2000 }), "GBP");

  assert.deepEqual(
    bars.map((b) => b.label),
    ["Mastermind", "Bespoke / other", "Power hour"],
    "biggest first, bespoke among them, and the offer with no price has no bar",
  );
  assert.equal(bars[0].value, 8000);
  assert.equal(bars[0].display, "£8,000");

  // Power hour is second in the list; the colour must follow the list, so
  // swapping the values must not move it.
  const swapped = winsByOffer(
    figuresFrom([
      { id: "a", name: "Mastermind", price: 100, salesFromCalls: 1 },
      { id: "b", name: "Power hour", price: 150, salesFromCalls: 6 },
    ]),
    "GBP",
  );
  assert.deepEqual(swapped.map((b) => b.label), ["Power hour", "Mastermind"]);
  assert.equal(
    swapped.find((b) => b.label === "Mastermind")?.colorIndex,
    0,
    "Mastermind keeps colour 0 after being overtaken",
  );
});
