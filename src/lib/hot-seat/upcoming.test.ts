import assert from "node:assert/strict";
import { test } from "node:test";

import { pickUpcomingSession } from "./upcoming.ts";

const AUG = { session_month: "2026-08-01", scheduled_for: "2026-08-16T23:00:00Z" };
const SEP = { session_month: "2026-09-01", scheduled_for: "2026-09-07T14:00:00Z" };
const AUG_NO_TIME = { session_month: "2026-08-01", scheduled_for: null };

test("a session later in the month is still upcoming mid-month", () => {
  // The exact regression: on 15 August, a session scheduled for the 16th was
  // hidden because the month's first Monday had passed.
  const now = new Date("2026-08-15T12:00:00Z");
  assert.equal(pickUpcomingSession([AUG, SEP], now), AUG);
});

test("once it has happened, the next month's session takes over", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  assert.equal(pickUpcomingSession([AUG, SEP], now), SEP);
});

test("a session stays visible while it is happening", () => {
  // Ten minutes in — the last moment anyone wants the page to go blank.
  const now = new Date("2026-08-16T23:10:00Z");
  assert.equal(pickUpcomingSession([AUG, SEP], now), AUG);
});

test("a session with no time set stays upcoming for its whole month", () => {
  // Even after week one, since without a time there's no way to know it has
  // happened. Hiding it would be a guess presented as a fact.
  const now = new Date("2026-08-28T12:00:00Z");
  assert.equal(pickUpcomingSession([AUG_NO_TIME], now), AUG_NO_TIME);
});

test("a past month with no time set is not offered", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  assert.equal(pickUpcomingSession([AUG_NO_TIME], now), null);
});

test("the earliest upcoming session wins, whatever order they arrive in", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  assert.equal(pickUpcomingSession([SEP, AUG], now), AUG);
});

test("no sessions at all is null, not a crash", () => {
  assert.equal(pickUpcomingSession([], new Date("2026-08-15T12:00:00Z")), null);
});
