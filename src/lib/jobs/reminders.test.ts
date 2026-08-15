import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPLETE_WEEK_MINUTES,
  MIDWEEK_BEHIND_MINUTES,
  isoWeekday,
  reminderKindForDate,
  remainingMinutes,
  shouldSendReminder,
} from "./reminders.ts";

test("isoWeekday puts Monday at 1 and Sunday at 7", () => {
  assert.equal(isoWeekday("2026-08-10"), 1); // Monday
  assert.equal(isoWeekday("2026-08-12"), 3); // Wednesday
  assert.equal(isoWeekday("2026-08-14"), 5); // Friday
  assert.equal(isoWeekday("2026-08-16"), 7); // Sunday
});

test("only two days of the week carry a reminder", () => {
  const week = [
    "2026-08-10", // Mon
    "2026-08-11", // Tue
    "2026-08-12", // Wed
    "2026-08-13", // Thu
    "2026-08-14", // Fri
    "2026-08-15", // Sat
    "2026-08-16", // Sun
  ];

  const kinds = week.map(reminderKindForDate);

  assert.deepEqual(kinds, [
    null,
    null,
    "log_reminder_midweek",
    null,
    "log_reminder_endweek",
    null,
    null,
  ]);
});

test("no daily ping — five days of the week are silent", () => {
  // §4 is explicit that there is no "did you log today" reminder. If this ever
  // fails, someone has quietly turned the product into a nag.
  const week = [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
  ];
  assert.equal(week.filter((d) => reminderKindForDate(d) === null).length, 5);
});

test("the mid-week nudge only fires when meaningfully behind", () => {
  assert.equal(shouldSendReminder("log_reminder_midweek", 0), true);
  assert.equal(shouldSendReminder("log_reminder_midweek", 239), true);
  // On pace, or close enough — left alone.
  assert.equal(
    shouldSendReminder("log_reminder_midweek", MIDWEEK_BEHIND_MINUTES),
    false,
  );
  assert.equal(shouldSendReminder("log_reminder_midweek", 400), false);
});

test("the end-of-week reminder only fires if the week still won't count", () => {
  assert.equal(shouldSendReminder("log_reminder_endweek", 480), true);
  assert.equal(
    shouldSendReminder("log_reminder_endweek", COMPLETE_WEEK_MINUTES - 1),
    true,
  );
  assert.equal(
    shouldSendReminder("log_reminder_endweek", COMPLETE_WEEK_MINUTES),
    false,
  );
  assert.equal(shouldSendReminder("log_reminder_endweek", 900), false);
});

test("someone already past ten hours is never chased", () => {
  for (const kind of ["log_reminder_midweek", "log_reminder_endweek"] as const) {
    assert.equal(shouldSendReminder(kind, COMPLETE_WEEK_MINUTES + 60), false);
  }
});

test("remaining never goes negative", () => {
  assert.equal(remainingMinutes(0), 600);
  assert.equal(remainingMinutes(480), 120);
  assert.equal(remainingMinutes(600), 0);
  assert.equal(remainingMinutes(900), 0);
});
