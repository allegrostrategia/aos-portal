/**
 * The hot seat's two reminder tracks (§5).
 *
 *   Submission — 7 days out; 2 days before the deadline, non-submitters only;
 *                a day-of final nudge framed as an incentive.
 *   Attendance — the day before; the morning of.
 *
 * **The day-of collision, resolved.** Both tracks land on the morning of the
 * session, and two emails in one morning would contradict the restraint the rest
 * of the reminder design is built on. So the day-of message is one email whose
 * content depends on whether they submitted: a non-submitter gets the final
 * nudge, a submitter gets the attendance reminder. Nobody gets both, and nobody
 * gets neither.
 *
 * Pure functions, so the rules are testable without a clock or a database.
 */

export type HotSeatReminderKind =
  | "hot_seat_submit_7d"
  | "hot_seat_submit_2d"
  | "hot_seat_submit_final"
  | "hot_seat_attend_1d"
  | "hot_seat_attend_am";

/** Which kinds become due when a session is `daysUntil` days away. */
export function kindsForDaysUntil(daysUntil: number): HotSeatReminderKind[] {
  if (daysUntil === 7) return ["hot_seat_submit_7d"];
  if (daysUntil === 2) return ["hot_seat_submit_2d"];
  if (daysUntil === 1) return ["hot_seat_attend_1d"];
  // Both are planned for the day itself; exactly one survives the check below.
  if (daysUntil === 0) return ["hot_seat_submit_final", "hot_seat_attend_am"];
  return [];
}

/**
 * Whether a planned reminder should actually go out, given whether the member
 * has submitted.
 *
 * Checked when the job runs rather than when it's planned, so somebody who
 * submits in between isn't chased for something they've already done.
 */
export function shouldSendHotSeatReminder(
  kind: HotSeatReminderKind,
  hasSubmitted: boolean,
): boolean {
  switch (kind) {
    case "hot_seat_submit_7d":
    case "hot_seat_attend_1d":
      // Everyone, submitted or not.
      return true;
    case "hot_seat_submit_2d":
    case "hot_seat_submit_final":
      // §5: non-submitters only.
      return !hasSubmitted;
    case "hot_seat_attend_am":
      // The other half of the day-of pair — the submitter's version.
      return hasSubmitted;
  }
}

/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
