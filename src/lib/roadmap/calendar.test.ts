import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCalendar, positionOn, snapStart, weekLabel, weekRange } from "./calendar.ts";

// September 2026: the 1st is a Tuesday, so the first Monday is the 7th.
const cal = buildCalendar("2026-09-07");

test("month 1 runs from the first Monday; weeks are counted within calendar months", () => {
  assert.equal(cal.startsOn, "2026-09-07");
  // Sept 2026 has Mondays on 7, 14, 21, 28: four weeks.
  assert.deepEqual(cal.months[0].weeks.map((w) => w.from), ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  // Oct 2026: 5, 12, 19, 26: four. Nov: 2, 9, 16, 23, 30: FIVE.
  assert.equal(cal.months[1].weeks.length, 4);
  assert.equal(cal.months[2].weeks.length, 5);
  assert.equal(cal.months[2].weeks[4].from, "2026-11-30");
});

test("the plan is six months and the total is the real number of weeks, not 24", () => {
  assert.equal(cal.months.length, 6);
  // Sept 4 + Oct 4 + Nov 5 + Dec 4 + Jan 4 + Feb 4 = 25
  assert.equal(cal.totalWeeks, 25);
  assert.equal(cal.weeks.at(-1)?.index, 25);
  assert.equal(cal.weeks.at(-1)?.from, "2027-02-22");
});

test("week numbering is continuous and week-of-month restarts each month", () => {
  const w5 = cal.weeks[4];
  assert.equal(w5.index, 5);
  assert.equal(w5.month, 2);
  assert.equal(w5.weekOfMonth, 1);
  assert.equal(w5.from, "2026-10-05");
});

test("the start snaps to the first Monday of its month, so an anchor can't drift", () => {
  assert.equal(snapStart("2026-09-21"), "2026-09-07");
  assert.equal(buildCalendar("2026-09-21").startsOn, "2026-09-07");
  // October 2026 starts on a Thursday; the 1st snaps forward to Monday the 5th.
  assert.equal(snapStart("2026-10-01"), "2026-10-05");
});

test("where today falls: before, during (the right week), after", () => {
  assert.deepEqual(positionOn(cal, "2026-09-03"), { kind: "before", startsOn: "2026-09-07" });
  const during = positionOn(cal, "2026-10-14"); // a Wednesday in week 6
  assert.equal(during.kind, "during");
  if (during.kind === "during") assert.equal(during.week.index, 6);
  assert.deepEqual(positionOn(cal, "2027-03-15"), { kind: "after", totalWeeks: 25 });
  // The days before September's first Monday belong to the plan's "before".
  assert.equal(positionOn(cal, "2026-09-06").kind, "before");
});

test("labels", () => {
  assert.equal(weekLabel(positionOn(cal, "2026-10-14"), cal.totalWeeks), "Week 6 of 25");
  assert.equal(weekLabel(positionOn(cal, "2026-09-01"), cal.totalWeeks), "Starts 7 September");
  assert.equal(weekRange(cal.weeks[0]), "7 – 13 Sept");
  assert.equal(weekRange(cal.weeks[3]), "28 Sept – 4 Oct");
});
