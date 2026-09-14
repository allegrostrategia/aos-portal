import assert from "node:assert/strict";
import { test } from "node:test";

import { datesForWeekday } from "./slots.ts";

test("the dates a weekday falls on in a month", () => {
  // September 2026: Tuesdays are the 1st, 8th, 15th, 22nd, 29th.
  assert.deepEqual(datesForWeekday("2026-09-01", 2), [
    "2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29",
  ]);
});

test("from a date onward, so past days aren't offered", () => {
  assert.deepEqual(datesForWeekday("2026-09-01", 2, "2026-09-14"), [
    "2026-09-15", "2026-09-22", "2026-09-29",
  ]);
});

test("a weekday with nothing left in the month is empty, not wrong", () => {
  assert.deepEqual(datesForWeekday("2026-09-01", 2, "2026-09-30"), []);
});

test("Sunday is 7, not 0 — ISO weekdays, matching SLOT_DAYS", () => {
  assert.deepEqual(datesForWeekday("2026-09-01", 7).slice(0, 2), ["2026-09-06", "2026-09-13"]);
});
