import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hourLabel,
  isSlot,
  readSlots,
  sharedSlots,
  slotLabel,
  slotLabelShort,
  slotsForMonth,
  weekdaysInMonth,
} from "./slots.ts";

test("the weekdays in a month, in order", () => {
  // October 2026 starts on a Thursday.
  const days = weekdaysInMonth("2026-10-01");
  assert.deepEqual(days.slice(0, 4), ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"]);
  assert.equal(days.length, 22);
});

test("from a date onward, so past days aren't offered", () => {
  assert.deepEqual(weekdaysInMonth("2026-10-01", "2026-10-29"), ["2026-10-29", "2026-10-30"]);
  assert.deepEqual(weekdaysInMonth("2026-10-01", "2026-11-01"), []);
});

test("the grid is every offered hour on every weekday", () => {
  const grid = slotsForMonth("2026-10-01", "2026-10-30");
  assert.equal(grid.length, 1);
  assert.equal(grid[0].date, "2026-10-30");
  assert.deepEqual(grid[0].slots.slice(0, 2), ["2026-10-30T09:00", "2026-10-30T10:00"]);
  assert.equal(grid[0].slots.at(-1), "2026-10-30T18:00");
  assert.equal(grid[0].slots.length, 10);
});

test("a slot is one offered hour on one weekday in the month", () => {
  assert.ok(isSlot("2026-10-06T14:00", "2026-10-01"));
  assert.ok(!isSlot("2026-10-04T14:00", "2026-10-01"), "a Sunday");
  assert.ok(!isSlot("2026-10-06T07:00", "2026-10-01"), "before nine");
  assert.ok(!isSlot("2026-10-06T19:00", "2026-10-01"), "after six");
  assert.ok(!isSlot("2026-10-06T14:30", "2026-10-01"), "not on the hour");
  assert.ok(!isSlot("2026-11-06T14:00", "2026-10-01"), "next month");
  assert.ok(!isSlot("2026-06-31T14:00"), "a date that doesn't exist");
  assert.ok(!isSlot("tue-pm"), "the retired weekday grid");
});

test("reading the column drops the old grid's keys and anything else unrecognised", () => {
  assert.deepEqual(
    readSlots({ slots: ["tue-pm", "2026-10-06T14:00", 3, "2026-10-06T14:00", "junk"] }, "2026-10-01"),
    ["2026-10-06T14:00"],
  );
  assert.deepEqual(readSlots(null), []);
  assert.deepEqual(readSlots({ slots: "2026-10-06T14:00" }), []);
});

test("shared slots come back earliest first, whatever order either person picked", () => {
  assert.deepEqual(
    sharedSlots(
      ["2026-10-20T10:00", "2026-10-06T14:00", "2026-10-06T09:00"],
      ["2026-10-06T14:00", "2026-10-20T10:00", "2026-10-13T11:00"],
    ),
    ["2026-10-06T14:00", "2026-10-20T10:00"],
  );
  assert.deepEqual(sharedSlots(["2026-10-06T14:00"], ["2026-10-07T14:00"]), []);
});

test("labels read as a person would say them", () => {
  assert.equal(hourLabel(9), "9am");
  assert.equal(hourLabel(12), "12pm");
  assert.equal(hourLabel(18), "6pm");
  assert.equal(slotLabel("2026-10-06T14:00"), "2pm on Tuesday 6 October");
  assert.equal(slotLabelShort("2026-10-06T14:00"), "2pm Tue 6 Oct");
  assert.equal(slotLabel("nonsense"), "nonsense");
});
