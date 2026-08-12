import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  buildItinerary,
  firstMondayOfMonth,
  firstMondayOfNextMonth,
  mondayOf,
  weekOfMonth,
} from "./cadence.ts";

test("mondayOf finds the start of the week", () => {
  assert.equal(mondayOf("2026-08-12"), "2026-08-10"); // Wednesday → Monday
  assert.equal(mondayOf("2026-08-10"), "2026-08-10"); // Monday → itself
  assert.equal(mondayOf("2026-08-16"), "2026-08-10"); // Sunday → same week
});

test("mondayOf crosses a month boundary", () => {
  // Tuesday 1 September 2026 belongs to the week starting Monday 31 August.
  assert.equal(mondayOf("2026-09-01"), "2026-08-31");
});

test("firstMondayOfMonth handles a month starting on a Monday", () => {
  assert.equal(firstMondayOfMonth("2026-06-15"), "2026-06-01"); // 1 Jun 2026 is a Monday
});

test("firstMondayOfMonth handles a month starting on a Sunday", () => {
  // 1 November 2026 is a Sunday, so the first Monday is the 2nd — the latest
  // possible offset, and the case a naive "first 7 days" rule gets wrong.
  assert.equal(firstMondayOfMonth("2026-11-20"), "2026-11-02");
});

test("firstMondayOfMonth handles a month starting on a Tuesday", () => {
  // 1 December 2026 is a Tuesday: the first Monday is the 7th.
  assert.equal(firstMondayOfMonth("2026-12-25"), "2026-12-07");
});

test("firstMondayOfNextMonth rolls over the year", () => {
  assert.equal(firstMondayOfNextMonth("2026-12-14"), "2027-01-04");
});

test("weekOfMonth counts from the first Monday", () => {
  assert.equal(weekOfMonth("2026-08-03"), 1); // first Monday of August 2026
  assert.equal(weekOfMonth("2026-08-12"), 2);
  assert.equal(weekOfMonth("2026-08-19"), 3);
  assert.equal(weekOfMonth("2026-08-26"), 4);
});

test("weekOfMonth returns 0 before the first Monday", () => {
  // 1–2 August 2026 fall in the previous month's last week, not week 1.
  assert.equal(weekOfMonth("2026-08-01"), 0);
});

test("addDays crosses months and leap days", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // 2028 is a leap year
  assert.equal(addDays("2027-02-28", 1), "2027-03-01"); // 2027 is not
});

test("itinerary lays out the cadence from a week-2 join", () => {
  // Wednesday 12 August 2026 — week 2 of the month.
  const it = buildItinerary("2026-08-12");

  assert.equal(it.welcomeDate, "2026-08-12");
  assert.equal(it.trackingWeekOne, "2026-08-10");
  assert.equal(it.trackingWeekTwo, "2026-08-17");
  assert.equal(it.oneToOneWeek, "2026-08-24");
  // Week 1 of September: the first Monday is the 7th.
  assert.equal(it.firstHotSeatWeek, "2026-09-07");
  assert.equal(it.joinedOffCycle, false);
});

test("itinerary flags a join outside week 2", () => {
  // 3 August 2026 is week 1 — enrolment is closed then (§1, hard rule), but a
  // hand-created record can still land there.
  assert.equal(buildItinerary("2026-08-03").joinedOffCycle, true);
});

test("the 1:1 week never spills into the following month", () => {
  // The worst case is a month whose first Monday is as late as possible, which
  // pushes week 4 latest. Checked across two years of week-2 joins.
  for (let year = 2026; year <= 2027; year++) {
    for (let month = 1; month <= 12; month++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-01`;
      const weekTwoMonday = addDays(firstMondayOfMonth(iso), 7);
      const it = buildItinerary(weekTwoMonday);

      assert.equal(
        it.oneToOneWeek.slice(0, 7),
        weekTwoMonday.slice(0, 7),
        `week 4 left the month for ${iso}`,
      );
      assert.ok(
        it.firstHotSeatWeek > it.oneToOneWeek,
        `hot seat should follow the 1:1 for ${iso}`,
      );
    }
  }
});
