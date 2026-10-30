/**
 * The top of a chart's scale, rounded to a number a person would have
 * chosen: 26,420 → 30,000, 6.9 → 8, 184,500 → 200,000.
 *
 * Shared by the two month charts so they cannot disagree — two charts on
 * one screen rounding differently would make the same figure look like two.
 *
 * One significant figure and a bit, rather than two, because the four
 * gridlines underneath have to be round as well: round 26,420 to two and
 * the top is 27,000, whose quarters are 6,750 and 13,500.
 */
const STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = STEPS.find((s) => value <= s * magnitude) ?? 10;
  return step * magnitude;
}
