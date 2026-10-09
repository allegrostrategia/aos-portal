import assert from "node:assert/strict";
import { test } from "node:test";

import {
  planReminders,
  ukDayOfMonth,
  ukPreviousMonth,
  type ReminderCandidate,
} from "./reminder-plan.ts";

/**
 * §8.1's two reminders, and the three people who must never get one.
 *
 * Pure, so the exclusions can be proved without a database and without
 * waiting for the 1st of a month.
 */

const base: ReminderCandidate = {
  workspaceId: "w1",
  ownerUserId: "u1",
  kind: "aos_member",
  accessEndDate: null,
  memberHasAccess: true,
  monthIsDone: false,
  alreadySent: [],
};

/** 08:00 UTC on the given UK date, which is when the cron runs. */
const at = (iso: string) => new Date(`${iso}T08:00:00Z`);

test("the 1st and the 8th, and no other day", () => {
  assert.equal(planReminders([base], at("2026-10-01")).length, 1);
  assert.equal(planReminders([base], at("2026-10-08")).length, 1);
  for (const day of ["2026-10-02", "2026-10-07", "2026-10-09", "2026-10-31"]) {
    assert.deepEqual(planReminders([base], at(day)), [], `nothing on ${day}`);
  }
});

test("the month is the one that just ended, across a year boundary", () => {
  assert.equal(planReminders([base], at("2026-10-01"))[0].month, "2026-09-01");
  assert.equal(planReminders([base], at("2027-01-01"))[0].month, "2026-12-01");
  assert.equal(planReminders([base], at("2027-01-08"))[0].month, "2026-12-01");
});

test("the day of the month is read in UK time, not UTC", () => {
  // The case that matters: British Summer Time is UTC+1, so 23:30 UTC on
  // 30 September is already 1 October in London. A job at midnight UTC
  // would otherwise send "your report for September" on the 30th — and
  // then again on the 1st.
  assert.equal(ukDayOfMonth(new Date("2026-09-30T23:30:00Z")), 1, "BST has rolled over");
  assert.equal(ukPreviousMonth(new Date("2026-09-30T23:30:00Z")), "2026-09-01");

  // And in winter, where UK is UTC, it has not.
  assert.equal(ukDayOfMonth(new Date("2026-12-31T23:30:00Z")), 31);
  assert.equal(ukDayOfMonth(new Date("2027-01-01T00:30:00Z")), 1);
});

test("a retainer client never gets one — Allegro fills in their data", () => {
  assert.deepEqual(planReminders([{ ...base, kind: "retainer" }], at("2026-10-01")), []);
});

test("a cancelled member is not chased for a report", () => {
  // Rule 7: cancelling revokes access and keeps every record. Their
  // figures stay; the nudges stop.
  assert.deepEqual(
    planReminders([{ ...base, memberHasAccess: false }], at("2026-10-01")),
    [],
  );
  assert.deepEqual(
    planReminders([{ ...base, memberHasAccess: false }], at("2026-10-08")),
    [],
  );
});

test("a Chiarezza login past its end date is a past attendee", () => {
  const ended = { ...base, kind: "chiarezza" as const, accessEndDate: "2026-09-30" };
  assert.deepEqual(planReminders([ended], at("2026-10-01")), []);

  // Still inside it, and they are reporting on themselves like anybody
  // else — the end date is in the future.
  const running = { ...base, kind: "chiarezza" as const, accessEndDate: "2026-12-31" };
  assert.equal(planReminders([running], at("2026-10-01")).length, 1);

  // And on the last day itself, access has not ended yet.
  const lastDay = { ...base, kind: "chiarezza" as const, accessEndDate: "2026-10-01" };
  assert.equal(planReminders([lastDay], at("2026-10-01")).length, 1);
});

test("the second one is only for a month still not done", () => {
  const done = { ...base, monthIsDone: true };
  // On the 1st it goes anyway — nobody has had a chance yet, and a month
  // that reads as done on day one is one nobody has touched.
  assert.equal(planReminders([done], at("2026-10-01")).length, 1);
  // On the 8th it does not.
  assert.deepEqual(planReminders([done], at("2026-10-08")), []);
});

test("neither is ever sent twice", () => {
  // `report_reminders` is the record, so a catch-up run after a missed
  // morning does not send again.
  assert.deepEqual(planReminders([{ ...base, alreadySent: [1] }], at("2026-10-01")), []);
  assert.deepEqual(planReminders([{ ...base, alreadySent: [2] }], at("2026-10-08")), []);
  // And having had the first does not stop the second.
  assert.equal(planReminders([{ ...base, alreadySent: [1] }], at("2026-10-08")).length, 1);
});

test("several people at once, each judged on their own", () => {
  const planned = planReminders(
    [
      { ...base, workspaceId: "member", ownerUserId: "m" },
      { ...base, workspaceId: "retainer", kind: "retainer" },
      { ...base, workspaceId: "cancelled", memberHasAccess: false },
      { ...base, workspaceId: "chiarezza-live", kind: "chiarezza", accessEndDate: "2026-12-31" },
      { ...base, workspaceId: "chiarezza-done", kind: "chiarezza", accessEndDate: "2026-08-31" },
    ],
    at("2026-10-01"),
  );
  assert.deepEqual(planned.map((p) => p.workspaceId), ["member", "chiarezza-live"]);
});
