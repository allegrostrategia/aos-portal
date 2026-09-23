import assert from "node:assert/strict";
import { test } from "node:test";

import { inMonth, isRecapMonth, lastCompleteMonth, monthOf, monthRange, shiftMonth } from "./month.ts";

test("any day in a month becomes its first", () => {
  assert.equal(monthOf("2026-09-14"), "2026-09-01");
  assert.equal(monthOf("2026-09-01"), "2026-09-01");
  assert.equal(monthOf(new Date("2026-12-31T23:30:00Z")), "2026-12-01");
});

test("the month a recap is written for is the one that just ended", () => {
  assert.equal(lastCompleteMonth("2026-10-03"), "2026-09-01");
  // Across a year boundary, which is where hand-rolled month arithmetic fails.
  assert.equal(lastCompleteMonth("2026-01-08"), "2025-12-01");
});

test("shifting months crosses years in both directions", () => {
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(shiftMonth("2026-03-01", -6), "2025-09-01");
});

test("the range is half-open, so no row is counted twice or missed", () => {
  assert.deepEqual(monthRange("2026-09-01"), {
    start: "2026-09-01",
    endExclusive: "2026-10-01",
  });
});

test("in-month takes dates and instants, and excludes the boundary", () => {
  assert.ok(inMonth("2026-09-01", "2026-09-01"));
  assert.ok(inMonth("2026-09-30T23:59:59Z", "2026-09-01"));
  assert.ok(!inMonth("2026-10-01T00:00:00Z", "2026-09-01"));
  assert.ok(!inMonth("2026-08-31", "2026-09-01"));
  assert.ok(!inMonth(null, "2026-09-01"));
  assert.ok(!inMonth(undefined, "2026-09-01"));
});

test("only a real first-of-month is accepted as a recap month", () => {
  assert.ok(isRecapMonth("2026-09-01"));
  assert.ok(!isRecapMonth("2026-09"));
  assert.ok(!isRecapMonth("2026-09-14"));
  assert.ok(!isRecapMonth("2026-13-01"));
  assert.ok(!isRecapMonth("nonsense"));
});
