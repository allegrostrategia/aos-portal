import { launchLastDay } from "./locked.ts";
import type { LaunchStage } from "./launch-queries.ts";

/**
 * When a launch runs, said in one line (Nina, 3 November: "launch cards
 * show the launch's full date range, first promo to last stage").
 *
 * **The range is the launch's own, not a month's.** A launch is the one
 * thing in the reporting tool that does not live inside a month — it
 * starts in one and finishes in another often enough that "Live in
 * September" above a card is a half-truth. The dates are on its stages,
 * so the span is the earliest date any stage carries to the latest,
 * which is exactly the pair the lock reads.
 *
 * `launchLastDay` is imported rather than rewritten: it is also what
 * decides whether a published launch is still editable, and a card that
 * disagreed with the lock about when a launch ended would be the kind of
 * difference nobody notices until it matters.
 */
export type StageDates = Pick<
  LaunchStage,
  "promo_start" | "promo_end" | "live_start" | "live_end"
>;

export function launchFirstDay(stages: StageDates[]): string | null {
  const dates = stages
    .flatMap((s) => [s.promo_start, s.promo_end, s.live_start, s.live_end])
    .filter((d): d is string => Boolean(d));
  // ISO dates sort as strings. No Date is built, so no zone can shift one.
  return dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const at = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

/**
 * "14 Sep - 2 Oct 2026", or "14 Sep 2026" for a single day.
 *
 * Short months and one year, because this sits under a launch's name on
 * a card about 299px wide and "14 September 2026 - 2 October 2026" is
 * two lines of furniture above the figures somebody came to read. The
 * year appears once, at the end, unless the launch crosses a new year —
 * which is a real case (a January launch promoted in December) and the
 * one where a single trailing year would be wrong.
 *
 * A hyphen, not an en dash: Nina's house rule of 3 November is single
 * dashes, and a card is as much her writing as an email is.
 *
 * Null when nothing has a date, so a launch still being planned shows no
 * line at all rather than a line with a dash in it.
 */
export function formatLaunchRange(first: string | null, last: string | null): string | null {
  if (!first || !last) return null;
  if (first === last) return DAY_MONTH_YEAR.format(at(first));

  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const from = sameYear ? DAY_MONTH.format(at(first)) : DAY_MONTH_YEAR.format(at(first));
  return `${from} - ${DAY_MONTH_YEAR.format(at(last))}`;
}

/** The whole thing, from a launch's stages. */
export function launchRange(stages: StageDates[]): string | null {
  return formatLaunchRange(launchFirstDay(stages), launchLastDay(stages));
}
