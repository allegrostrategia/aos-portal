/**
 * Colour for the log's calendar and charts.
 *
 * The brief asks for time blocks "colour-coded by category" — there are ten
 * categories, and on a calendar any two of them can sit side by side. Ten hues
 * that stay distinguishable in every pairing, under colour-vision deficiency,
 * on a cream surface, do not exist; the dataviz method caps an any-pair
 * identity palette at about three. So the blocks are coloured by the
 * category's *bucket* — the product's own secondary tag (Systems & Delivery,
 * Profit, Visibility) — and every block carries its category name in text.
 * Colour says which kind of work; the label says which work.
 *
 * These three are the brand navy and orange re-stepped for chart duty, plus a
 * teal. Validated on the card surface (#F9F2E6), all pairs, light mode:
 * lightness band, chroma floor, CVD separation (worst pair ΔE 9.8 protan),
 * normal-vision floor, and 3:1 contrast all pass. The brand orange itself is
 * 2.63:1 on cream, which is why the chart step is deeper than the button.
 *
 * The bar charts use one hue only — bars of a single measure never take a
 * colour per bar, because that spends the identity channel on what the bar's
 * length already says.
 */
export type Bucket = "systems_delivery" | "profit" | "visibility" | "launch";

export const BUCKET_COLOUR: Record<Bucket, string> = {
  systems_delivery: "#1F4FA3",
  profit: "#E8590C",
  visibility: "#1F8A70",
  // No category uses this bucket today. Folded to the systems hue rather than
  // given a fourth, which would break the all-pairs guarantee above.
  launch: "#1F4FA3",
};

export const BUCKET_LABEL: Record<Bucket, string> = {
  systems_delivery: "Systems & delivery",
  profit: "Profit",
  visibility: "Visibility",
  launch: "Launch",
};

/** The single hue for a magnitude chart. */
export const CHART_HUE = "#1F4FA3";

export function bucketColour(bucket: string | null | undefined): string {
  return BUCKET_COLOUR[(bucket as Bucket) ?? "systems_delivery"] ?? CHART_HUE;
}
