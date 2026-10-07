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
  // Dom's wording, 7 October, kept to the word in the single case. The
  // plural only changes what grammar forces: "It" to "They", and the
  // repeated month name to "them", since naming four months twice in one
  // sentence stops being a warning and starts being a paragraph.
  const one = labels.length === 1;
  const subject = one ? "It" : "They";
  const republish = one ? named : "them";

  return (
    `${named} ${one ? "uses" : "use"} figures from this month. ` +
    `${subject} will show dashes until you republish, and if you change ` +
    `anything here, republish ${republish} too.`
  );
}
