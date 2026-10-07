import { monthLabel } from "./months.ts";

/**
 * What taking a month back to draft does to the months after it.
 *
 * Found on 7 October by a browser test, and verified at the source: a
 * client's figures are computed from the months **they** can read, and a
 * retainer client can only read published ones. Two reads cross a month
 * boundary — `getMonthData` loads the previous month for every "vs. last
 * month" comparison, and `getClientFlow` walks the whole history for the
 * opening-figure chain — so unpublishing August empties part of a
 * September report the client still has open. Retention and churn go with
 * it, because they are built on the same chain.
 *
 * It comes back on republish. The risk is nobody knowing it went: Nina
 * unpublishes to fix one number, gets pulled away, and a published report
 * quietly reads as dashes until she returns.
 *
 * So this is a warning, not a refusal (Dom, 7 October). The wording is
 * his. The real fix is to freeze a month's carried figures when it is
 * published, which is a separate plan and a separate decision.
 */

/** Joins month labels the way a person would say them. */
function listOf(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The sentence, or null when there is nothing to warn about.
 *
 * `laterPublished` is every published month after this one; `hasFigures`
 * is whether this month holds anything for them to have carried. Both
 * have to be true — a month with no figures in it is not feeding anybody,
 * and a later month that is itself a draft is not in front of a client.
 */
export function unpublishWarning(
  laterPublished: string[],
  hasFigures: boolean,
): string | null {
  if (!hasFigures || laterPublished.length === 0) return null;

  const labels = [...laterPublished].sort().map(monthLabel);
  const named = listOf(labels);
  // Dom's wording, 7 October, third and final version — and the three
  // versions are the story of what was actually wrong.
  //
  //   1. "will show dashes"  — contradicted by the measurement: three
  //      figures vanished and one came out WRONG, reading 3 where the
  //      client had been shown 25.
  //   2. "some of its figures will be missing" — true once the strict
  //      `activeClientsAtEnd` stopped the wrong number.
  //   3. this one — true once the snapshot means a published month stops
  //      losing anything at all. Nothing goes missing any more; what is
  //      left is that the later month keeps the figures it went out with
  //      until somebody republishes it.
  //
  // The plural changes only what grammar forces.
  const one = labels.length === 1;
  const republish = one ? named : "them";

  return (
    `${named} ${one ? "uses" : "use"} figures from this month. ` +
    `If you change anything here, republish ${republish} too, so ` +
    `${one ? "it picks" : "they pick"} up the correction.`
  );
}
