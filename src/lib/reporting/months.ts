/**
 * Which month a reporting screen is showing.
 *
 * Pure, and tested, for the same reason `lib/log/weeks.ts` is: the rules about
 * which months exist are small, easy to get subtly wrong, and wrong in a way
 * that only shows up at a month boundary — which is once a month, usually not
 * while anyone is looking.
 *
 * Every month in the database is stored as the first day of that month, so a
 * "month" here is always `YYYY-MM-01`.
 */

export interface MonthView {
  /** `YYYY-MM-01`, as stored. */
  month: string;
  /** "September 2026". */
  label: string;
  /** The previous month, or null at the workspace's first month. */
  previous: string | null;
  /** The next month, or null at the latest reportable one. */
  next: string | null;
  /** Every month from first to latest, newest first — the picker's options. */
  options: { month: string; label: string }[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `YYYY-MM` or `YYYY-MM-DD` to the first of that month. Null if unparseable. */
export function firstOfMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${MONTH_NAMES[Number(monthNumber) - 1]} ${year}`;
}

function shift(month: string, by: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  // Month is 1-based here and 0-based in Date, which cancels out: passing the
  // 1-based number as the 0-based index already means "the next month".
  const d = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * The latest month worth reporting on: the last one that has finished.
 *
 * Not the current month. A report is a look back at a completed month — §8.1's
 * reminder on the 1st says "Time to fill in your report for [last month]" —
 * and offering the month everyone is still living in invites half a month's
 * figures to be saved as if they were the whole thing.
 */
export function latestReportableMonth(today: string): string {
  const current = firstOfMonth(today.slice(0, 7));
  if (!current) throw new Error(`Unparseable date: ${today}`);
  return shift(current, -1);
}

/**
 * Resolve the month a screen should show.
 *
 * `requested` comes from `?month=`, so it is whatever was in the URL. Anything
 * outside the workspace's range falls back to the latest reportable month
 * rather than erroring: a stale bookmark or a hand-edited URL should show a
 * real month, not a stack trace.
 *
 * A workspace whose first month has not finished yet still gets one month to
 * look at — its own first — so the screen has something to render.
 */
export function resolveMonth(
  requested: string | null | undefined,
  today: string,
  firstMonth: string,
  /**
   * When given, the ONLY months this person may be offered.
   *
   * A retainer client is shown their published months and nothing else:
   * §8 says a draft is the team's, and offering August and September in a
   * dropdown when only August exists for them advertises a month they
   * cannot read and then explains itself wrongly. An empty array means
   * nothing has been published yet, which is a real state — the picker is
   * empty and the screen says so.
   *
   * Undefined means no restriction, which is what editors get.
   */
  allowed?: string[],
): MonthView {
  const first = firstOfMonth(firstMonth);
  if (!first) throw new Error(`Unparseable first month: ${firstMonth}`);

  const latestRaw = latestReportableMonth(today);
  const latest = latestRaw < first ? first : latestRaw;

  if (allowed) {
    // Newest first, de-duplicated, and only months that are really months.
    const months = [...new Set(allowed.map(firstOfMonth).filter((m): m is string => m !== null))]
      .sort()
      .reverse();

    const asked = firstOfMonth(requested);

    // An in-range month that simply is not published stays on screen as
    // itself, so the page can say it is not ready yet. Swapping it for the
    // newest published one would answer a different question than the one
    // asked and leave the URL disagreeing with the heading. Anything
    // outside the workspace's range, or unparseable, still falls back.
    const inRange = asked !== null && asked >= first && asked <= latest;
    const month = inRange ? asked : (months[0] ?? latest);
    const index = months.indexOf(month);

    return {
      month,
      label: monthLabel(month),
      // Walk the allowed list, not the calendar: the months a client can
      // see need not be consecutive, and stepping to an unpublished one
      // would put them back where they started.
      // Walk the allowed list, not the calendar: the months a client can
      // see need not be consecutive, and stepping to an unpublished one
      // would put them back where they started. When the month on screen
      // is not in the list at all — an unpublished one reached by URL —
      // the arrows point at the nearest published months either side.
      previous:
        index >= 0
          ? (index < months.length - 1 ? months[index + 1] : null)
          : (months.find((m) => m < month) ?? null),
      next:
        index >= 0
          ? (index > 0 ? months[index - 1] : null)
          : ([...months].reverse().find((m) => m > month) ?? null),
      options: months.map((m) => ({ month: m, label: monthLabel(m) })),
    };
  }

  const asked = firstOfMonth(requested);
  const month = asked && asked >= first && asked <= latest ? asked : latest;

  const options: { month: string; label: string }[] = [];
  for (let m = latest; m >= first; m = shift(m, -1)) {
    options.push({ month: m, label: monthLabel(m) });
    // A misconfigured first_month far in the past would otherwise build a list
    // of thousands. Ten years of months is more than this product will ever
    // need and is a bound rather than a silent hang.
    if (options.length >= 120) break;
  }

  return {
    month,
    label: monthLabel(month),
    previous: month > first ? shift(month, -1) : null,
    next: month < latest ? shift(month, 1) : null,
    options,
  };
}
