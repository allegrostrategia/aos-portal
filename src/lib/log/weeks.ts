// Relative rather than the usual `@/` alias: this module is covered by unit
// tests, and Node's test runner resolves imports itself without the bundler's
// path mapping (the same note as log/priming.ts).
import { addDays, mondayOf, type IsoDate } from "../onboarding/cadence.ts";

/**
 * Which week the log is showing (Dom, 30 September 2026).
 *
 * The log used to be the current week and nothing else. Members can now page
 * back through the weeks they have already lived — **read-only**: a signed-off
 * week is a record, and the current week is the only one still being written.
 *
 * Pure, so the boundaries can be tested without a database or a clock. The
 * boundaries are the whole of it: a week that is off the end in either
 * direction is the bug worth preventing, since both produce a page that looks
 * fine and is about nothing.
 */

export type WeekView = {
  /** The Monday being shown. */
  weekStart: IsoDate;
  weekEnd: IsoDate;
  /** Only the current week is editable and signable. */
  isCurrent: boolean;
  /** The Monday before, or null at the first week they were a member. */
  previous: IsoDate | null;
  /** The Monday after, or null on the current week. */
  next: IsoDate | null;
};

/**
 * The earliest week to offer: the one they joined in. Paging back past that
 * is paging into weeks where they were not a member, which is not history,
 * it is an empty page with a date on it.
 */
export function firstWeek(joinDate: IsoDate): IsoDate {
  return mondayOf(joinDate);
}

/**
 * Resolve `?week=` against what exists.
 *
 * Anything unparseable, in the future, or before they joined falls back to the
 * current week rather than erroring: a hand-typed URL should land somewhere
 * sensible, and there is nothing dangerous to protect here — only their own
 * weeks are readable either way.
 */
export function resolveWeek(
  requested: string | undefined,
  today: IsoDate,
  joinDate: IsoDate,
): WeekView {
  const current = mondayOf(today);
  const earliest = firstWeek(joinDate);

  const wanted =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested))
      ? mondayOf(requested)
      : current;

  const weekStart = wanted > current || wanted < earliest ? current : wanted;

  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    isCurrent: weekStart === current,
    previous: addDays(weekStart, -7) >= earliest ? addDays(weekStart, -7) : null,
    next: weekStart === current ? null : addDays(weekStart, 7),
  };
}

/**
 * Which day of the shown week to open on.
 *
 * Today when today is in it; otherwise the Monday. Falling back to today in a
 * past week would select a day the week does not contain, and the calendar
 * strip would highlight nothing.
 */
export function dayWithin(view: WeekView, requested: string | undefined, today: IsoDate): IsoDate {
  if (requested && requested >= view.weekStart && requested <= view.weekEnd) return requested;
  return view.isCurrent ? today : view.weekStart;
}
