/**
 * The colours a chart may use, and the order it must use them in.
 *
 * **Run `node scripts/check-chart-palette.mjs` before changing this.** The
 * order is not a taste decision: it is the one that clears OKLab separation
 * under simulated deuteranopia and protanopia for every pair, not just
 * adjacent ones, because a donut can put any two slices side by side.
 *
 * Two brand colours are deliberately absent. Blush and lemon separate by
 * **0.5** under protanopia — indistinguishable — and 13.1 under normal
 * vision, which is below the floor for full-colour readers too. gold/blush
 * fails that floor as well, at 13.8. They stay decorative; they are not
 * series colours. Checked 5 October 2026, before anything was drawn with
 * them.
 *
 * Colour follows the entity, never its rank: the nth offer by name order
 * keeps the nth colour, so a filter that changes how many offers there are
 * does not repaint the survivors.
 */

export const SERIES = [
  { name: "navy", fill: "var(--aos-navy)" },
  { name: "orange", fill: "var(--aos-orange)" },
  { name: "gold", fill: "var(--aos-gold)" },
  { name: "sky", fill: "var(--aos-sky)" },
  { name: "charcoal", fill: "var(--aos-charcoal)" },
] as const;

/** Beyond the fifth, a sixth hue is where the palette breaks. */
export const MAX_SERIES = SERIES.length;

export const OTHER_FILL = "var(--aos-cream-deep)";

/**
 * The one hue for a single-measure chart.
 *
 * Navy, because it is the only brand colour with real contrast on cream
 * (9.28:1) and because CLAUDE.md reserves it for "where the colour itself is
 * the point" — which a bar is.
 */
export const SINGLE = "var(--aos-navy)";

/**
 * Every fill gets this, and the pale ones need it.
 *
 * Only navy and charcoal clear 3:1 against the cream card. Gold is 1.27 and
 * sky 1.44, so without an edge a slice simply has no boundary where it meets
 * the card. A hairline at low alpha gives it one without becoming a line in
 * its own right.
 */
export const EDGE = "color-mix(in oklab, var(--aos-ink) 14%, transparent)";

/** The gap between two fills, in the surface colour, so they never touch. */
export const SEPARATOR = "var(--aos-card)";

export function fillFor(index: number): string {
  return index < MAX_SERIES ? SERIES[index].fill : OTHER_FILL;
}
