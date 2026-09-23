/**
 * The month a recap is about.
 *
 * Kept apart from the queries so it can be tested without a database, and so
 * every screen agrees on what "September" means down to the boundary: the
 * first of the month inclusive, the first of the next exclusive. Half-open,
 * because a closed range has to decide what to do with 23:59:59 and always
 * decides it wrong once.
 */

export type MonthRange = { start: string; endExclusive: string };

/** "2026-09-14" or a Date → "2026-09-01". */
export function monthOf(date: Date | string = new Date()): string {
  const iso = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  return `${iso.slice(0, 7)}-01`;
}

/**
 * The month a recap is written for by default: the one that has just ended.
 *
 * A recap is a look back, so Nina opens this screen in early October to write
 * up September. Defaulting to the current month would put her in front of a
 * half-finished month every time and make the right answer a click away.
 */
export function lastCompleteMonth(today: Date | string = new Date()): string {
  return shiftMonth(monthOf(today), -1);
}

/** The first of the month `by` months away. Negative goes back. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return date.toISOString().slice(0, 10);
}

/** First of the month, first of the next. Dates, not instants. */
export function monthRange(month: string): MonthRange {
  return { start: month, endExclusive: shiftMonth(month, 1) };
}

/** Whether a date string falls inside the month. */
export function inMonth(date: string | null | undefined, month: string): boolean {
  if (!date) return false;
  const { start, endExclusive } = monthRange(month);
  const day = date.slice(0, 10);
  return day >= start && day < endExclusive;
}

/** A first-of-month string, as every recap screen and action requires. */
export function isRecapMonth(value: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(value) && !Number.isNaN(Date.parse(value));
}
