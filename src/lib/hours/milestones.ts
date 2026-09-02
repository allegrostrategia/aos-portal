/**
 * The milestone path (§2).
 *
 * 50 / 100 / 250 / 500 are real thresholds, not placeholders — paced so a member
 * with two or three active builds reaches the first in about two months, and 500
 * only after genuinely sustained membership.
 *
 * Pure functions, so the arithmetic behind the headline number can be tested
 * without a database.
 */

export const MILESTONES = [50, 100, 250, 500] as const;

export type MilestoneProgress = {
  /** Thresholds already passed, in order. */
  reached: number[];
  /** The next threshold, or null once all of them are behind you. */
  next: number | null;
  /** Hours still to go, rounded up — never a fraction of an hour to nag about. */
  toNext: number | null;
  /** 0–1 through the current band, for a progress bar. */
  fraction: number;
};

export function milestoneProgress(hours: number): MilestoneProgress {
  const total = Math.max(0, hours);
  const reached = MILESTONES.filter((m) => total >= m);
  const next = MILESTONES.find((m) => total < m) ?? null;

  if (next === null) {
    return { reached: [...reached], next: null, toNext: null, fraction: 1 };
  }

  // Measured from the previous threshold, not from zero: at 260 hours the bar
  // should read as just past 250 rather than nearly full, or the last stretch to
  // 500 looks like no progress at all for months.
  const previous = reached.length > 0 ? reached[reached.length - 1] : 0;
  const span = next - previous;

  return {
    reached: [...reached],
    next,
    toNext: Math.ceil(next - total),
    fraction: span > 0 ? Math.min(1, Math.max(0, (total - previous) / span)) : 0,
  };
}

/** "62 hrs · 38 to your next unlock" — the compact Piazza line from §2. */
export function milestoneLine(hours: number): string {
  const { next, toNext } = milestoneProgress(hours);
  const total = formatHours(hours);

  if (next === null) return `${total} hrs · every milestone passed`;
  return `${total} hrs · ${toNext} to your next unlock`;
}

/**
 * Hours as members should read them: whole where whole, one decimal otherwise.
 * A rate of 2.5 hrs/week makes fractional totals normal, and "37.5" is honest
 * where "38" quietly rounds up the product's headline claim.
 */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
