// Relative, not the `@/lib` alias: this module is pure and its test
// loads it in the plain node runner, which does not resolve aliases.
// One source for the zone either way.
import { APP_TIME_ZONE } from "../time-zone.ts";

/**
 * Who is due a report reminder today, and for which month (§8.1).
 *
 * Pure, so the three exclusions Dom named can be tested without a
 * database and without waiting for the 1st of a month.
 *
 * **Two reminders, ever.** The 1st: "Time to fill in your report for
 * [last month]." The 8th, and only if it is still not done: "Don't
 * forget…". The brief is explicit that nothing follows them.
 */

export interface ReminderCandidate {
  workspaceId: string;
  ownerUserId: string;
  kind: "retainer" | "aos_member" | "chiarezza";
  /** Null for a Chiarezza workspace with no end date, and for the others. */
  accessEndDate: string | null;
  /** False once a membership is cancelled. Null for a login with no member row. */
  memberHasAccess: boolean | null;
  /** Whether last month's visible categories are all filled. */
  monthIsDone: boolean;
  /** Which of the two have already gone out for that month. */
  alreadySent: number[];
}

export interface PlannedReminder {
  workspaceId: string;
  ownerUserId: string;
  month: string;
  reminder: 1 | 2;
}

/**
 * The calendar day in UK terms, not UTC.
 *
 * The cron runs at 08:00 UTC, where the two agree — but a job moved to
 * midnight would fire on the 31st in British Summer Time and send "your
 * report for September" on the last day of September. Said here so the
 * rule does not depend on what time the cron happens to run (Dom, 9 Oct).
 */
export function ukDayOfMonth(instant: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, day: "numeric" })
      .format(instant),
  );
}

/** The month a reminder is about: the one that has just ended, in UK terms. */
export function ukPreviousMonth(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const previous = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return `${previous.y}-${String(previous.m).padStart(2, "0")}-01`;
}

export function planReminders(
  candidates: ReminderCandidate[],
  instant: Date,
): PlannedReminder[] {
  const day = ukDayOfMonth(instant);
  if (day !== 1 && day !== 8) return [];

  const reminder: 1 | 2 = day === 1 ? 1 : 2;
  const month = ukPreviousMonth(instant);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE })
    .format(instant);

  return candidates
    .filter((c) => {
      // §8.1: "Retainer clients don't get these, because Allegro fills in
      // their data."
      if (c.kind === "retainer") return false;

      // Rule 7: cancelling revokes access and keeps every record. A
      // former member is not chased for a report (Dom, 9 Oct).
      if (c.memberHasAccess === false) return false;

      // Chiarezza access ends on a date. After it, they are a past
      // attendee, not somebody who owes anybody a report.
      if (c.accessEndDate !== null && c.accessEndDate < today) return false;

      // The second one is only for a month that is still not done. The
      // first goes whether or not it is, because on the 1st nobody has
      // had a chance yet.
      if (reminder === 2 && c.monthIsDone) return false;

      // Never twice. `report_reminders` is the record, so a catch-up run
      // after a missed morning does not re-send.
      return !c.alreadySent.includes(reminder);
    })
    .map((c) => ({
      workspaceId: c.workspaceId,
      ownerUserId: c.ownerUserId,
      month,
      reminder,
    }));
}
