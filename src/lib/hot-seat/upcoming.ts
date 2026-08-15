/**
 * Which scheduled session a member is heading towards.
 *
 * Pulled out as a pure function because the first version got this wrong in a
 * way that was invisible: it assumed the session happens on the first Monday of
 * its month, and skipped the whole month once that date had passed. A session
 * scheduled for the 16th therefore vanished from the 4th onwards — the row was
 * fine, the query simply refused to look at it.
 *
 * The lesson encoded here: `scheduled_for` is the truth about when a session
 * happens. The month is only its identity, and the cadence's "week one" is a
 * convention Nina follows, not a rule the data obeys.
 */

export type SchedulableSession = {
  session_month: string;
  scheduled_for: string | null;
};

/**
 * How long a session stays on screen after it starts. It runs about an hour;
 * three hours keeps it visible while it's happening and for a while afterwards,
 * rather than disappearing from under someone mid-call.
 */
const GRACE_MS = 3 * 60 * 60 * 1000;

export function pickUpcomingSession<T extends SchedulableSession>(
  sessions: T[],
  now: Date,
): T | null {
  const currentMonth = `${now.toISOString().slice(0, 7)}-01`;

  const upcoming = sessions
    .filter((session) => {
      if (session.scheduled_for) {
        return new Date(session.scheduled_for).getTime() + GRACE_MS > now.getTime();
      }
      // No time set yet: it stays the upcoming session for the whole of its
      // month. Without a time there's no way to know it has happened, and
      // hiding it would be a guess dressed as a fact.
      return session.session_month >= currentMonth;
    })
    .sort((a, b) => a.session_month.localeCompare(b.session_month));

  return upcoming[0] ?? null;
}
