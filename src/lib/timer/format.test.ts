import assert from "node:assert/strict";
import { test } from "node:test";

import { formatElapsed, formatMinutes, weekProgress } from "./format.ts";

test("formatElapsed reads as a stopwatch", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(9), "0:09");
  assert.equal(formatElapsed(65), "1:05");
  assert.equal(formatElapsed(3600), "1:00:00");
  assert.equal(formatElapsed(3661), "1:01:01");
  assert.equal(formatElapsed(36000), "10:00:00");
});

test("formatElapsed never shows a negative clock", () => {
  // A device clock behind the server's would otherwise produce "-1:-30".
  assert.equal(formatElapsed(-5), "0:00");
});

test("formatMinutes reads as an amount", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(200), "3h 20m");
  assert.equal(formatMinutes(600), "10h");
});

test("weekProgress caps at 100 so the bar can't overflow", () => {
  assert.equal(weekProgress(0, 600), 0);
  assert.equal(weekProgress(300, 600), 50);
  assert.equal(weekProgress(600, 600), 100);
  assert.equal(weekProgress(900, 600), 100);
});

test("weekProgress survives a zero target", () => {
  assert.equal(weekProgress(100, 0), 0);
});
