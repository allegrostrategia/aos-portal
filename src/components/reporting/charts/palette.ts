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

import type { IconTone } from "../icons";

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

/**
 * The colours a 2px STROKE may use — a trend line, a sparkline, a dot.
 *
 * **A separate set from `SERIES`, and it has to be.** A fill is a large
 * shape and the hairline above gives it a boundary, so a pale hue survives
 * at 1.4:1. A line IS its own edge, so it owes the reader the full 3:1
 * unaided — and at full strength only navy clears that: on the white
 * reporting card orange is 2.93, blush 1.73, sky 1.60 and gold 1.41. A gold
 * line on white is very nearly not there.
 *
 * So these are the brand hues mixed towards ink in OKLab until they pass:
 * orange needs 10% and sky 35%. **Gold and blush are deliberately absent.**
 * A dark yellow is olive and a dark coral is mauve, so neither survives
 * being darkened as itself — there is no version of them that is both legible
 * as a line and recognisable as the brand colour, and inventing one would be
 * a third palette nobody approved.
 *
 * Checked, not judged:
 *
 *   node scripts/check-chart-palette.mjs "orange-ink,navy,sky-ink" white --lines
 *
 * white: 3.45 / 10.32 / 3.42 · cream: 3.10 / 9.28 / 3.07 · worst CVD pair
 * navy/sky-ink at 12.9, well over the floor of 8.
 *
 * Two series is all Stage 3's charts need (revenue against profit, reach
 * against views, save rate against share rate). A chart wanting a third
 * line should become small multiples instead of reaching further down this
 * list.
 */
export const LINE_SERIES = [
  { name: "orange-ink", stroke: "#e56135" },
  { name: "navy", stroke: "var(--aos-navy)" },
  { name: "sky-ink", stroke: "#688fb0" },
] as const;

export const MAX_LINES = LINE_SERIES.length;

export function strokeFor(index: number): string {
  return LINE_SERIES[index % MAX_LINES].stroke;
}

/**
 * The ink a sparkline is drawn in: its own card's disc, darkened until it
 * passes.
 *
 * **The mockups' intent, kept; their colours, not quite.** Each KPI card's
 * sparkline takes the hue of the icon disc beside it (Dom, 30 October), so
 * the card reads as one object rather than a tinted circle with an unrelated
 * navy wire under it. What it cannot take is the disc's *value*: a disc is a
 * large filled shape and survives at 1.4:1, a 2px line is its own edge and
 * owes the reader 3:1. So each tone maps to the nearest ink in `LINE_SERIES`
 * that clears it.
 *
 * Gold and lemon both land on navy, for the reason set out above — a dark
 * yellow is olive, and there is no darkening of gold that is both legible
 * and still gold. Blush lands on orange-ink for the same reason in the other
 * direction: a dark coral is mauve, and of the three inks that exist
 * orange's is the one a coral disc points at. Those two are approximations
 * and are meant to be read as such; the alternative was a third palette
 * nobody approved.
 *
 * Checked, not judged — the three inks are `LINE_SERIES`, so:
 *
 *   node scripts/check-chart-palette.mjs "orange-ink,navy,sky-ink" white --lines
 *
 * white: 3.45 / 10.32 / 3.42 · cream: 3.10 / 9.28 / 3.07.
 *
 * **This is colour following position, and that is allowed here only
 * because nothing is being told apart by it.** The rule the palette exists
 * to protect — colour follows the entity, never its rank — is about charts
 * where two colours sit in one picture and the reader has to match them to
 * a legend. A sparkline is alone on its card, with one series and no
 * legend, so its hue distinguishes it from nothing. It is the disc's
 * colour, repeated.
 */
const SPARK_INK: Record<IconTone, string> = {
  orange: "#e56135",
  blush: "#e56135",
  sky: "#688fb0",
  gold: "var(--aos-navy)",
  lemon: "var(--aos-navy)",
};

/** Navy, for a card with no disc to take a colour from. */
export const SPARK_STROKE = "var(--aos-navy)";

export function sparkStroke(tone?: IconTone): string {
  return tone ? SPARK_INK[tone] : SPARK_STROKE;
}

/** The wash under it, so it reads as a shape and not only as a wire. */
export function sparkFill(tone?: IconTone): string {
  return `color-mix(in oklab, ${sparkStroke(tone)} 12%, transparent)`;
}
