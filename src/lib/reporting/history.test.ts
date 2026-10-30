import test from "node:test";
import assert from "node:assert/strict";

import { alignToMonths, hasShape } from "./history.ts";
import { monthsEndingAt, shortMonthLabel } from "./months.ts";

/**
 * Lining several months of figures up on a calendar.
 *
 * This is where a trend chart goes wrong: a month missed, a month drawn
 * twice, or a metric's points sliding one place because an earlier month
 * had nothing in it. Every one of those draws a chart that looks perfectly
 * convincing and says the wrong thing.
 */

const MONTHS = ["2026-07-01", "2026-08-01", "2026-09-01"];

test("the axis is the calendar, not the rows", () => {
  // August has nothing. It still gets a place, and the place is null.
  const aligned = alignToMonths(
    [
      { month: "2026-07-01", metric_key: "revenue", value: 100 },
      { month: "2026-09-01", metric_key: "revenue", value: 300 },
    ],
    ["revenue"],
    MONTHS,
  );

  assert.deepEqual(aligned.get("revenue"), [100, null, 300]);
});

test("a metric with no rows at all is still a full-length run of nulls", () => {
  // Otherwise a chart indexing points against month labels would read
  // undefined for every month of it, or worse, draw the next metric's.
  const aligned = alignToMonths([], ["revenue", "profit"], MONTHS);

  assert.deepEqual(aligned.get("revenue"), [null, null, null]);
  assert.deepEqual(aligned.get("profit"), [null, null, null]);
});

test("a genuine zero survives; it is a figure somebody entered", () => {
  const aligned = alignToMonths(
    [{ month: "2026-08-01", metric_key: "new_clients", value: 0 }],
    ["new_clients"],
    MONTHS,
  );

  assert.deepEqual(aligned.get("new_clients"), [null, 0, null]);
});

test("a row outside the window is dropped, not appended", () => {
  // The query is bounded, but a wider one reused here must not be able to
  // lengthen the series and slide every point off its label.
  const aligned = alignToMonths(
    [
      { month: "2026-01-01", metric_key: "revenue", value: 1 },
      { month: "2026-09-01", metric_key: "revenue", value: 300 },
    ],
    ["revenue"],
    MONTHS,
  );

  assert.equal(aligned.get("revenue")?.length, 3);
  assert.deepEqual(aligned.get("revenue"), [null, null, 300]);
});

test("a row for a key nobody asked for is ignored", () => {
  const aligned = alignToMonths(
    [{ month: "2026-07-01", metric_key: "something_else", value: 9 }],
    ["revenue"],
    MONTHS,
  );

  assert.equal(aligned.size, 1);
  assert.deepEqual(aligned.get("revenue"), [null, null, null]);
});

test("two months is a shape; one is not", () => {
  assert.equal(hasShape([1, 2]), true);
  assert.equal(hasShape([null, 5, null]), false);
  assert.equal(hasShape([null, null]), false);
  assert.equal(hasShape(undefined), false);
  // A flat pair is still a shape — flat is something a reader can see.
  assert.equal(hasShape([5, 5]), true);
});

test("the months run oldest first and end at the month asked for", () => {
  assert.deepEqual(monthsEndingAt("2026-09-01", 3), [
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
  ]);
});

test("the run crosses a year boundary without inventing a month", () => {
  assert.deepEqual(monthsEndingAt("2026-02-01", 4), [
    "2025-11-01",
    "2025-12-01",
    "2026-01-01",
    "2026-02-01",
  ]);
});

test("twelve months is twelve, with no duplicates", () => {
  const months = monthsEndingAt("2026-09-01", 12);
  assert.equal(months.length, 12);
  assert.equal(new Set(months).size, 12);
  assert.equal(months[0], "2025-10-01");
  assert.equal(months[11], "2026-09-01");
});

test("the axis label is three letters and no year", () => {
  assert.equal(shortMonthLabel("2026-09-01"), "Sep");
  assert.equal(shortMonthLabel("2026-01-01"), "Jan");
  assert.equal(shortMonthLabel("2025-12-01"), "Dec");
});
