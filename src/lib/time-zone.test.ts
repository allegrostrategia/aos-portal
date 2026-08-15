import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatSessionTime,
  utcToWallClock,
  wallClockToUtc,
} from "./time-zone.ts";

test("a summer wall clock is stored an hour behind, not as UTC", () => {
  // The actual bug: 23:00 on 16 August is BST, so 22:00 UTC. Storing it as
  // 23:00 UTC pushed the session to just after midnight the following day.
  assert.equal(
    wallClockToUtc("2026-08-16T23:00").toISOString(),
    "2026-08-16T22:00:00.000Z",
  );
});

test("a winter wall clock is stored unchanged — GMT is UTC", () => {
  assert.equal(
    wallClockToUtc("2026-01-15T14:00").toISOString(),
    "2026-01-15T14:00:00.000Z",
  );
});

test("the same instant formats identically wherever it is rendered", () => {
  // The second half of the bug: one screen said Sunday, the email said Monday,
  // because one pinned London and the other used the server's zone.
  const stored = "2026-08-16T22:00:00.000Z";
  assert.equal(formatSessionTime(stored), "Sunday 16 August at 23:00");
});

test("the previously stored instant is the one that reads wrong", () => {
  // What is in the database right now, formatted correctly: an hour late, and
  // therefore on the following day.
  assert.equal(
    formatSessionTime("2026-08-16T23:00:00.000Z"),
    "Monday 17 August at 00:00",
  );
});

test("wall clock survives a round trip in summer and winter", () => {
  for (const local of ["2026-08-16T23:00", "2026-01-15T14:00", "2026-06-01T09:30"]) {
    assert.equal(utcToWallClock(wallClockToUtc(local)), local, local);
  }
});

test("times either side of the October DST change round-trip", () => {
  // Clocks go back on 25 October 2026. Either side of it the offset differs, so
  // a single-pass conversion would drift.
  assert.equal(
    wallClockToUtc("2026-10-24T12:00").toISOString(),
    "2026-10-24T11:00:00.000Z", // still BST
  );
  assert.equal(
    wallClockToUtc("2026-10-26T12:00").toISOString(),
    "2026-10-26T12:00:00.000Z", // GMT
  );
});

test("seconds are optional on the way in", () => {
  assert.equal(
    wallClockToUtc("2026-01-15T14:00:00").toISOString(),
    "2026-01-15T14:00:00.000Z",
  );
});
