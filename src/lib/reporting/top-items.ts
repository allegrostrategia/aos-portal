/**
 * The top three hooks and the top three b-roll clips (§5.3), and which of
 * them have proved themselves.
 *
 * Not figures: a hook is a line of text with a view count beside it, and
 * what makes it worth keeping is that it keeps coming back. **"Proven"
 * means in the top three in two or more months** — the brief's own rule,
 * and the reason this needs to look across months rather than at one.
 *
 * Matching is on the words, because that is all there is: the same hook
 * typed again next month is a different row with the same text. So the
 * comparison is deliberately forgiving about the things that are not the
 * hook — surrounding space, capitalisation, a double space in the middle
 * — and strict about everything else. Two hooks that differ by a word
 * are two hooks.
 */

export type TopItemType = "hook" | "b_roll";

export interface TopItem {
  id?: string;
  month: string;
  item_type: TopItemType;
  rank: number;
  body: string;
  views: number | null;
}

/** What two typings of the same hook have in common. */
export function normalise(body: string): string {
  return body.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * How many distinct months each item has been in the top three.
 *
 * Distinct months, not rows: the same hook at rank 1 and rank 2 in one
 * month — which the unique index forbids, but data arrives by other
 * routes — is one month, not two.
 */
export function monthsSeen(history: TopItem[]): Map<string, Set<string>> {
  const seen = new Map<string, Set<string>>();
  for (const item of history) {
    const key = `${item.item_type}|${normalise(item.body)}`;
    if (normalise(item.body) === "") continue;
    const months = seen.get(key) ?? new Set<string>();
    months.add(item.month);
    seen.set(key, months);
  }
  return seen;
}

/**
 * Is this one proven, and in how many months?
 *
 * Returns the count as well as the verdict, because "in three months"
 * is worth saying on screen and "proven" on its own is not.
 */
export function provenness(
  item: Pick<TopItem, "item_type" | "body">,
  history: TopItem[],
): { proven: boolean; months: number } {
  const months =
    monthsSeen(history).get(`${item.item_type}|${normalise(item.body)}`)?.size ?? 0;
  return { proven: months >= 2, months };
}
