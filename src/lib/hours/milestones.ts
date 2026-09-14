/**
 * The milestone path (§2).
 *
 * 50 / 100 / 250 / 500 / 750 are real thresholds, not placeholders — paced so a
 * member with two or three active builds reaches the first in about two months,
 * and the last only after genuinely sustained membership.
 *
 * 750 was added 8 September 2026, with the illustrated path: the artwork carries
 * five markers, and a fifth threshold on the road with nothing behind it in the
 * data would have been a decoration pretending to be a milestone.
 *
 * Pure functions, so the arithmetic behind the headline number can be tested
 * without a database.
 */

export const MILESTONES = [50, 100, 250, 500, 750] as const;

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
  // 750 looks like no progress at all for months.
  const previous = reached.length > 0 ? reached[reached.length - 1] : 0;
  const span = next - previous;

  return {
    reached: [...reached],
    next,
    toNext: Math.ceil(next - total),
    fraction: span > 0 ? Math.min(1, Math.max(0, (total - previous) / span)) : 0,
  };
}

/**
 * "62 hrs · 38 to your next milestone" — the compact Piazza line from §2.
 *
 * §2 words this as "distance to next unlock", and nothing unlocks: no reward is
 * defined anywhere in the brief. Real unlockable rewards at each threshold are
 * intended eventually and aren't scoped — until they are, the copy says
 * milestone. A number that quietly promises something is worse than one that
 * just says how far you've come.
 */
export function milestoneLine(hours: number): string {
  const { next, toNext } = milestoneProgress(hours);
  const total = formatHours(hours);

  if (next === null) return `${total} hrs · every milestone passed`;
  return `${total} hrs · ${toNext} to your next milestone`;
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

/**
 * Where a total sits along the illustrated road, 0–1.
 *
 * Evenly spaced: each threshold is a fifth of the road, whatever the hour gap
 * either side of it. The alternative — road distance proportional to hours — was
 * considered and rejected on 8 September, for the same reason the band bar above
 * measures from the previous threshold rather than from zero. Proportional
 * spacing puts fifty hours 6.7% along and gives the 500→750 stretch a third of
 * the picture, so a new member watches nothing move for months and a long-
 * standing one watches it crawl. The road stops being a fair map of the hours;
 * it stays a fair map of the journey, which is what it is for.
 */
export function milestonePathFraction(hours: number): number {
  const { reached, next, fraction } = milestoneProgress(hours);
  if (next === null) return 1;
  return (reached.length + fraction) / MILESTONES.length;
}

export type MilestoneStep = {
  target: number;
  reached: boolean;
  /** Monday of the week the running total first crossed it. */
  reachedInWeek: string | null;
  /** Hours still to go, rounded up. Null once reached. */
  toGo: number | null;
};

export type MilestoneJourney = {
  steps: MilestoneStep[];
  total: number;
  /** Weeks that earned something, oldest first. */
  weeks: { weekStartDate: string; hours: number; runningTotal: number }[];
};

/**
 * The journey behind the number (§2).
 *
 * Walks the ledger in order and records the week each threshold was crossed,
 * which is the thing a progress bar can't say: not "you're 62% of the way" but
 * "you passed fifty in the week of 9 March". The ledger is append-only precisely
 * so that answer stays true — a rate retired in June doesn't move when March
 * happened.
 *
 * Weeks are expected oldest-first. A running total is carried rather than
 * recomputed per milestone, so a member with two years of weeks costs one pass.
 *
 * A week that earned nothing still appears: it's a week they were a member
 * up, and dropping it would make the record of their membership sparser than
 * the truth.
 */
export function milestoneJourney(
  ledger: { weekStartDate: string; hours: number }[],
): MilestoneJourney {
  const weeks: MilestoneJourney["weeks"] = [];
  const crossedIn = new Map<number, string>();

  let running = 0;
  for (const week of ledger) {
    const before = running;
    running += week.hours;
    weeks.push({ ...week, runningTotal: running });

    for (const target of MILESTONES) {
      if (before < target && running >= target && !crossedIn.has(target)) {
        crossedIn.set(target, week.weekStartDate);
      }
    }
  }

  const steps = MILESTONES.map((target) => {
    const reachedInWeek = crossedIn.get(target) ?? null;
    return {
      target,
      reached: running >= target,
      reachedInWeek,
      toGo: running >= target ? null : Math.ceil(target - running),
    };
  });

  return { steps, total: running, weeks };
}
