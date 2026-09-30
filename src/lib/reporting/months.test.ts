import assert from "node:assert/strict";
import { test } from "node:test";

import {
  firstOfMonth,
  latestReportableMonth,
  monthLabel,
  resolveMonth,
} from "./months.ts";

const TODAY = "2026-09-30";
const FIRST = "2026-01-01";

test("a month is always the first of that month", () => {
  assert.equal(firstOfMonth("2026-09"), "2026-09-01");
  assert.equal(firstOfMonth("2026-09-17"), "2026-09-01");
  assert.equal(firstOfMonth("  2026-09  "), "2026-09-01");
  assert.equal(firstOfMonth(null), null);
  assert.equal(firstOfMonth("not a month"), null);
  assert.equal(firstOfMonth("2026-13"), null, "month 13 does not exist");
  assert.equal(firstOfMonth("2026-00"), null);
});

test("the latest reportable month is the last completed one, not this one", () => {
  // A report looks back at a finished month. Offering September on 30
  // September invites most of a month's figures to be saved as all of them.
  assert.equal(latestReportableMonth("2026-09-30"), "2026-08-01");
  assert.equal(latestReportableMonth("2026-09-01"), "2026-08-01");
});

test("the latest reportable month crosses a year end", () => {
  assert.equal(latestReportableMonth("2027-01-04"), "2026-12-01");
});

test("no month asked for means the latest reportable one", () => {
  const view = resolveMonth(undefined, TODAY, FIRST);
  assert.equal(view.month, "2026-08-01");
  assert.equal(view.label, "August 2026");
  assert.equal(view.next, null, "there is nothing later to page into");
  assert.equal(view.previous, "2026-07-01");
});

test("a month in range is honoured, and pages both ways", () => {
  const view = resolveMonth("2026-04", TODAY, FIRST);
  assert.equal(view.month, "2026-04-01");
  assert.equal(view.previous, "2026-03-01");
  assert.equal(view.next, "2026-05-01");
});

test("any day of a month resolves to that month", () => {
  assert.equal(resolveMonth("2026-04-23", TODAY, FIRST).month, "2026-04-01");
});

test("a future month falls back rather than erroring", () => {
  // A stale bookmark or a hand-edited URL should show a real month.
  assert.equal(resolveMonth("2027-05", TODAY, FIRST).month, "2026-08-01");
});

test("a month before the workspace existed falls back too", () => {
  assert.equal(resolveMonth("2025-11", TODAY, FIRST).month, "2026-08-01");
});

test("nonsense in the URL falls back", () => {
  assert.equal(resolveMonth("../../etc/passwd", TODAY, FIRST).month, "2026-08-01");
  assert.equal(resolveMonth("", TODAY, FIRST).month, "2026-08-01");
});

test("at the first month there is nowhere back to go", () => {
  const view = resolveMonth("2026-01", TODAY, FIRST);
  assert.equal(view.previous, null);
  assert.equal(view.next, "2026-02-01");
});

test("the picker lists every month, newest first", () => {
  const view = resolveMonth(undefined, TODAY, FIRST);
  assert.equal(view.options.length, 8, "January to August");
  assert.equal(view.options[0].label, "August 2026");
  assert.equal(view.options.at(-1)!.label, "January 2026");
});

test("a workspace whose first month has not finished still gets one to look at", () => {
  // Set up mid-September with first_month September: August is before they
  // existed and September has not finished, so neither rule leaves a month.
  const view = resolveMonth(undefined, "2026-09-15", "2026-09-01");
  assert.equal(view.month, "2026-09-01");
  assert.equal(view.previous, null);
  assert.equal(view.next, null);
  assert.deepEqual(view.options.map((o) => o.month), ["2026-09-01"]);
});

test("the options list is bounded against a misconfigured first month", () => {
  // A first_month of 1900 should not build a list of 1,500 entries.
  const view = resolveMonth(undefined, TODAY, "1900-01-01");
  assert.equal(view.options.length, 120);
  assert.equal(view.options[0].month, "2026-08-01");
});

test("month labels read as a person would say them", () => {
  assert.equal(monthLabel("2026-01-01"), "January 2026");
  assert.equal(monthLabel("2026-12-01"), "December 2026");
});
