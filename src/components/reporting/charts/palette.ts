/**
 * The colours a chart may use, and the order it must use them in.
 *
 * **Run `node scripts/check-chart-palette.mjs "" white` before changing
 * this.** The order is not a taste decision and it is not the mockups'
 * either: it is the one order of their five hues that clears OKLab
 * separation under simulated deuteranopia and protanopia for every pair,
 * not just adjacent ones, because a donut can put any two slices side by
 * side.
 *
 * **Why these five, and why in this order.** Nina approved the mockups'
 * palette on 30 October 2026 — orange, sky, yellow, coral, navy. Checked as
 * the mockups draw them (orange → sky → gold → blush → navy) they FAIL:
 * gold and blush separate by 13.8 under normal vision, under the floor of
 * 15, which no amount of secondary encoding excuses. Moving gold up one
 * place so it never sits beside blush clears every pair. The set is the
 * mockups'; the sequence is the checker's.
 *
 * **So do not reorder this to match a picture.** The tightest pair left is
 * sky/blush at CVD 9.0 and normal 15.3, barely over both floors, and any
 * swap that brings gold and blush together puts the palette back under.
 *
 * Checked on the reporting card (white, Nina's 30 October surface
 * exception) as well as on cream: every pale fill is under 3:1 on both, so
 * every one of them owes the reader an edge and a labelled legend, which the
 * components below provide.
 *
 * Colour follows the entity, never its rank: the nth offer by name order
 * keeps the nth colour, so a filter that changes how many offers there are
 * does not repaint the survivors.
 */

export const SERIES = [
  { name: "orange", fill: "var(--aos-orange)" },
  { name: "gold", fill: "var(--aos-gold)" },
  { name: "sky", fill: "var(--aos-sky)" },
  { name: "blush", fill: "var(--aos-blush)" },
  { name: "navy", fill: "var(--aos-navy)" },
] as const;

/** Beyond the fifth, a sixth hue is where the palette breaks. */
export const MAX_SERIES = SERIES.length;

export const OTHER_FILL = "var(--aos-cream-deep)";

/**
 * The one hue for a single-measure chart whose bars are not identities.
 *
 * Navy, because it is the only brand colour with real contrast on either
 * card (9.28:1 on cream, 10.32:1 on white) and because CLAUDE.md reserves it
 * for "where the colour itself is the point" — which a bar is.
 *
 * **Still the default, and still right for most bar charts.** A bar chart of
 * one measure across days, or stages, or months, is one kind of thing
 * measured repeatedly, and giving each bar its own hue would say they were
 * different kinds of thing. The exception is a chart whose categories ARE
 * the identities — leads by source, revenue by offer — where the colour
 * carries the same meaning it carries in the donut and the legend beside it.
 * Those pass `colourByCategory`; nothing else should.
 */
export const SINGLE = "var(--aos-navy)";

/**
 * Every fill gets this, and the pale ones need it.
 *
 * Navy is the only one of the five that clears 3:1 against either card. On
 * white: orange 2.93, blush 1.73, sky 1.60, gold 1.41 — so without an edge a
 * slice simply has no boundary where it meets the card. A hairline at low
 * alpha gives it one without becoming a line in its own right.
 */
export const EDGE = "color-mix(in oklab, var(--aos-ink) 14%, transparent)";

/** The gap between two fills, in the surface colour, so they never touch. */
export const SEPARATOR = "var(--aos-card)";

export function fillFor(index: number): string {
  return index < MAX_SERIES ? SERIES[index].fill : OTHER_FILL;
}
