import assert from "node:assert/strict";
import { test } from "node:test";

import { dayWithin, firstWeek, resolveWeek } from "./weeks.ts";

// 2026-09-30 is a Wednesday; its Monday is the 28th.
const TODAY = "2026-09-30";
const THIS_MONDAY = "2026-09-28";
const JOINED = "2026-08-07"; // a Friday, in the week of Monday the 3rd

test("no week asked for means the current one, and it's the editable one", () => {
  const view = resolveWeek(undefined, TODAY, JOINED);
  assert.equal(view.weekStart, THIS_MONDAY);
  assert.equal(view.weekEnd, "2026-10-04");
  assert.equal(view.isCurrent, true);
  assert.equal(view.next, null, "there is no next week to page into");
  assert.equal(view.previous, "2026-09-21");
});

test("any day of a week resolves to that week's Monday", () => {
  for (const day of ["2026-09-21", "2026-09-24", "2026-09-27"]) {
    assert.equal(resolveWeek(day, TODAY, JOINED).weekStart, "2026-09-21");
  }
});

test("a past week is not the current one, and pages both ways", () => {
  const view = resolveWeek("2026-09-14", TODAY, JOINED);
  assert.equal(view.isCurrent, false);
  assert.equal(view.previous, "2026-09-07");
  assert.equal(view.next, "2026-09-21");
});

// Both directions off the end produce a page that looks fine and is about
// nothing, so both fall back rather than render.
test("a future week falls back to the current one", () => {
  assert.equal(resolveWeek("2026-10-12", TODAY, JOINED).weekStart, THIS_MONDAY);
});

test("a week before they joined falls back too", () => {
  assert.equal(resolveWeek("2026-07-06", TODAY, JOINED).weekStart, THIS_MONDAY);
});

test("nonsense falls back rather than erroring", () => {
  for (const junk of ["", "last-week", "2026-13-40", "2026-09"]) {
    assert.equal(resolveWeek(junk, TODAY, JOINED).weekStart, THIS_MONDAY);
  }
});

test("the week they joined in is the end of the road backwards", () => {
  assert.equal(firstWeek(JOINED), "2026-08-03");
  const view = resolveWeek("2026-08-03", TODAY, JOINED);
  assert.equal(view.weekStart, "2026-08-03");
  assert.equal(view.previous, null, "nothing before they were a member");
  assert.equal(view.next, "2026-08-10");
});

test("the open day is today in this week, and the Monday in any other", () => {
  const current = resolveWeek(undefined, TODAY, JOINED);
  assert.equal(dayWithin(current, undefined, TODAY), TODAY);
  assert.equal(dayWithin(current, "2026-09-29", TODAY), "2026-09-29");

  const past = resolveWeek("2026-09-14", TODAY, JOINED);
  assert.equal(dayWithin(past, undefined, TODAY), "2026-09-14");
  assert.equal(dayWithin(past, "2026-09-17", TODAY), "2026-09-17");
  // Today isn't in that week, so it can't be the selected day.
  assert.equal(dayWithin(past, TODAY, TODAY), "2026-09-14");
});
