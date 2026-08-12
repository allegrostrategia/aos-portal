/**
 * The fixed monthly cycle (§1).
 *
 *   Week 1 — monthly hot seat, for everyone active
 *   Week 2 — the new cohort joins; tracking, part 1
 *   Week 3 — tracking, part 2
 *   Week 4 — 1:1 with Nina, roadmap delivered
 *   → Week 1 of the following month — that cohort's first hot seat
 *
 * **Weeks are counted from the first Monday of the month.** The brief says
 * "week 1", "week 2" without defining where a month's weeks begin, and every
 * date on the itinerary depends on the answer — so it's pinned here, once,
 * rather than being re-decided by each thing that needs it. First Monday rather
 * than "the week containing the 1st" because a month beginning on a Saturday
 * would otherwise have a two-day week 1, and a cohort would join in what feels
 * like the first week of the month.
 *
 * Everything works in plain `YYYY-MM-DD` strings and UTC. Dates in the database
 * are `date`, not `timestamptz`, and running them through a local-timezone
 * `Date` is how "joined on the 7th" quietly becomes the 6th for anyone west of
 * Greenwich.
 */

export type IsoDate = string; // YYYY-MM-DD

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** The Monday of the week containing `date`. Weeks run Monday to Sunday. */
export function mondayOf(date: IsoDate): IsoDate {
  const d = toUtc(date);
  // getUTCDay(): 0 = Sunday. Shift so Monday = 0.
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

/** The first Monday of the month containing `date`. */
export function firstMondayOfMonth(date: IsoDate): IsoDate {
  const d = toUtc(date);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const offset = (8 - first.getUTCDay()) % 7; // days from the 1st to Monday
  return addDays(toIso(first), offset);
}

/** The first Monday of the month *after* the one containing `date`. */
export function firstMondayOfNextMonth(date: IsoDate): IsoDate {
  const d = toUtc(date);
  const firstOfNext = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
  );
  return firstMondayOfMonth(toIso(firstOfNext));
}

/**
 * Which week of its month a date falls in, counting from the first Monday.
 * Returns 0 for the days before the first Monday — they belong to the previous
 * month's last week, not to week 1.
 */
export function weekOfMonth(date: IsoDate): number {
  const firstMonday = firstMondayOfMonth(date);
  const monday = mondayOf(date);

  if (monday < firstMonday) return 0;

  const diffDays =
    (toUtc(monday).getTime() - toUtc(firstMonday).getTime()) / 86_400_000;

  return Math.floor(diffDays / 7) + 1;
}

export type Itinerary = {
  /** Day one: the welcome session and the itinerary itself. */
  welcomeDate: IsoDate;
  /** Monday of tracking week one (week 2 of the month). */
  trackingWeekOne: IsoDate;
  /** Monday of tracking week two (week 3). */
  trackingWeekTwo: IsoDate;
  /** Monday of the week the 1:1 and roadmap land in (week 4). */
  oneToOneWeek: IsoDate;
  /** Monday of their first hot seat — week 1 of the following month. */
  firstHotSeatWeek: IsoDate;
  /**
   * True when the member joined outside week 2. Enrolment is a hard rule (§1),
   * but a hand-created record can still land anywhere, and the itinerary should
   * say so rather than quietly print dates computed from a bad premise.
   */
  joinedOffCycle: boolean;
};

/**
 * Build a member's itinerary from the date their onboarding starts.
 *
 * Deliberately returns week-beginning dates, not appointment times. The exact
 * hot seat slot and 1:1 time don't exist anywhere yet — the hot seat schedule is
 * Step 6 and the 1:1 is booked with Nina directly — so printing a precise time
 * would be inventing one.
 */
export function buildItinerary(onboardingStartDate: IsoDate): Itinerary {
  const trackingWeekOne = mondayOf(onboardingStartDate);

  return {
    welcomeDate: onboardingStartDate,
    trackingWeekOne,
    trackingWeekTwo: addDays(trackingWeekOne, 7),
    oneToOneWeek: addDays(trackingWeekOne, 14),
    firstHotSeatWeek: firstMondayOfNextMonth(onboardingStartDate),
    joinedOffCycle: weekOfMonth(onboardingStartDate) !== 2,
  };
}
