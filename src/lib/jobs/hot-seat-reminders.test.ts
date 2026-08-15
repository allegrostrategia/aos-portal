import assert from "node:assert/strict";
import { test } from "node:test";

import {
  daysBetween,
  kindsForDaysUntil,
  shouldSendHotSeatReminder,
  type HotSeatReminderKind,
} from "./hot-seat-reminders.ts";

test("only four days in the run-up carry a reminder", () => {
  const days = [10, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const withReminders = days.filter((d) => kindsForDaysUntil(d).length > 0);
  assert.deepEqual(withReminders, [7, 2, 1, 0]);
});

test("nothing fires after the session has passed", () => {
  assert.deepEqual(kindsForDaysUntil(-1), []);
  assert.deepEqual(kindsForDaysUntil(-30), []);
});

test("exactly one email lands on the morning of the session", () => {
  // Both kinds are planned; the check decides which one survives. Two emails in
  // one morning would contradict the restraint of the whole reminder design.
  const planned = kindsForDaysUntil(0);
  assert.equal(planned.length, 2);

  for (const hasSubmitted of [true, false]) {
    const sent = planned.filter((kind) =>
      shouldSendHotSeatReminder(kind, hasSubmitted),
    );
    assert.equal(sent.length, 1, `expected one email when submitted=${hasSubmitted}`);
  }
});

test("the day-of email matches whether they submitted", () => {
  assert.deepEqual(
    kindsForDaysUntil(0).filter((k) => shouldSendHotSeatReminder(k, false)),
    ["hot_seat_submit_final"],
  );
  assert.deepEqual(
    kindsForDaysUntil(0).filter((k) => shouldSendHotSeatReminder(k, true)),
    ["hot_seat_attend_am"],
  );
});

test("the 2-day nudge goes to non-submitters only", () => {
  assert.equal(shouldSendHotSeatReminder("hot_seat_submit_2d", false), true);
  assert.equal(shouldSendHotSeatReminder("hot_seat_submit_2d", true), false);
});

test("the 7-day and day-before reminders go to everyone", () => {
  for (const kind of [
    "hot_seat_submit_7d",
    "hot_seat_attend_1d",
  ] as HotSeatReminderKind[]) {
    assert.equal(shouldSendHotSeatReminder(kind, true), true);
    assert.equal(shouldSendHotSeatReminder(kind, false), true);
  }
});

test("a member who submits early is never chased again", () => {
  // Every submission-track reminder must fall silent once they've submitted.
  const submissionTrack: HotSeatReminderKind[] = [
    "hot_seat_submit_2d",
    "hot_seat_submit_final",
  ];
  for (const kind of submissionTrack) {
    assert.equal(shouldSendHotSeatReminder(kind, true), false, kind);
  }
});

test("daysBetween counts whole days across month ends", () => {
  assert.equal(daysBetween("2026-08-15", "2026-08-22"), 7);
  assert.equal(daysBetween("2026-08-31", "2026-09-01"), 1);
  assert.equal(daysBetween("2026-08-16", "2026-08-16"), 0);
  assert.equal(daysBetween("2026-08-17", "2026-08-16"), -1);
});
