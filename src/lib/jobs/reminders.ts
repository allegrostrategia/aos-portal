/**
 * When a weekly-log reminder is due, and whether it should actually be sent.
 *
 * §4 is deliberately restrained about this: a mid-week nudge only if
 * meaningfully behind pace, an end-of-week one only if still short, and
 * explicitly **no daily "did you log today" ping**. The tone of the whole
 * product depends on this not becoming noise — a reminder that arrives when
 * someone is already on track teaches them to ignore the next one.
 *
 * Pure functions, so the rules can be tested without a database or a clock.
 */

/** 10 logged hours is a complete week (§4). */
export const COMPLETE_WEEK_MINUTES = 600;

/**
 * Wednesday for the mid-week nudge, Friday for the check-in.
 *
 * Friday rather than Sunday deliberately: "still time to stay in the draw" has
 * to be actionable, and for most service businesses Sunday isn't. The week still
 * runs to Sunday, so it stays true. Since round 6 the Friday one is also the
 * check-in nudge, which is the other reason Friday is right — Nina reads the
 * sign-offs over the weekend and answers on Monday.
 *
 * 1 = Monday … 7 = Sunday (ISO).
 */
export const MIDWEEK_DAY = 3;
export const ENDWEEK_DAY = 5;

/**
 * By Wednesday, pro-rata pace toward ten hours is about 4h 20m. The nudge fires
 * below four hours — comfortably behind rather than marginally, so someone
 * having a normal-but-slow start isn't chased.
 */
export const MIDWEEK_BEHIND_MINUTES = 240;

export type ReminderKind = "log_reminder_midweek" | "log_reminder_endweek";

/** ISO weekday for a YYYY-MM-DD date, 1 = Monday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Which reminder, if any, belongs to this date. */
export function reminderKindForDate(date: string): ReminderKind | null {
  const weekday = isoWeekday(date);
  if (weekday === MIDWEEK_DAY) return "log_reminder_midweek";
  if (weekday === ENDWEEK_DAY) return "log_reminder_endweek";
  return null;
}

/**
 * Whether the reminder is warranted, given where they've got to.
 *
 * Checked twice: once when planning, and again when the job actually runs. A
 * member who logs four hours between the two shouldn't be told they're behind —
 * the second check is what stops a queued reminder going stale.
 */
export function shouldSendReminder(
  kind: ReminderKind,
  loggedMinutes: number,
): boolean {
  if (kind === "log_reminder_midweek") {
    return loggedMinutes < MIDWEEK_BEHIND_MINUTES;
  }
  // Friday goes to everyone since round 6 §1, because it is now the check-in
  // nudge first and the hours nudge second: signing off the week is what
  // Nina reads over the weekend and answers on Monday, and that is worth
  // saying to somebody who has logged plenty as much as to somebody who
  // hasn't. The hours paragraph inside it is what stays conditional.
  //
  // One Friday email either way (Dom, 28 Sep). Two on one morning — a
  // check-in nudge and a prize-draw nudge — is exactly the noise the rest of
  // this file exists to avoid.
  return true;
}

/** Whether Friday's email should carry its hours paragraph. */
export function isShortOfCompleteWeek(loggedMinutes: number): boolean {
  return loggedMinutes < COMPLETE_WEEK_MINUTES;
}

export function remainingMinutes(loggedMinutes: number): number {
  return Math.max(0, COMPLETE_WEEK_MINUTES - loggedMinutes);
}
