import type { Figure } from "./formulas.ts";

/**
 * Which price a funnel month is worth, and when that may change.
 *
 * §5.5 says funnel revenue is "purchases × linked offer price". Read from
 * the offer's price *now*, that sentence rewrites history: raise a price
 * in November and October's funnel revenue moves with it, on a report the
 * client was sent in October.
 *
 * So the price is captured with the month's figures. Dom's rules,
 * 6 October, and the second one is the one I would have got wrong:
 *
 *   1. **Captured once**, on the first save of that funnel month.
 *   2. **Later saves leave it alone.** Capturing on every save would mean
 *      fixing a typo in June's figures in December silently swapped
 *      June's price for December's — on a month that was published in
 *      July.
 *   3. **A published month never changes its captured price**, by any
 *      route, including the correction button.
 *   4. On an unpublished month the captured price is shown read-only,
 *      with a button to take the offer's current price. That is the route
 *      for corrections, and it is deliberate rather than automatic.
 *   5. Changing which offer a funnel is linked to, on an unpublished
 *      month, takes the new offer's price.
 *
 * Pure, so the rule that decides whether a published month can move can
 * be tested without a database anywhere near it.
 */

export type PriceReason =
  /** An ordinary save of the month's figures. */
  | "save"
  /** The "Use the current price" button. */
  | "use_current"
  /** The funnel was pointed at a different offer. */
  | "offer_changed";

export type PriceDecision =
  /** Nothing to write: it is already right, or it is not ours to change. */
  | { action: "keep"; because: string }
  /** The first capture for this funnel month. */
  | { action: "capture"; price: number }
  /** A deliberate correction on an unpublished month. */
  | { action: "replace"; price: number };

export function decidePrice({
  stored,
  published,
  offerPrice,
  reason,
}: {
  /** The price already captured for this funnel month, if any. */
  stored: Figure;
  /** Whether the month has been sent to the client. */
  published: boolean;
  /** The linked offer's price as it stands now. Null if no offer. */
  offerPrice: Figure;
  reason: PriceReason;
}): PriceDecision {
  // Rule 3, and it comes first because it beats everything else. A month
  // the client has read does not change, whatever anybody presses.
  if (published) {
    return { action: "keep", because: "this month is published" };
  }

  if (offerPrice === null || offerPrice === undefined) {
    return {
      action: "keep",
      because: "the funnel has no linked offer, so there is no price to take",
    };
  }

  if (reason === "save") {
    // Rules 1 and 2.
    return stored === null || stored === undefined
      ? { action: "capture", price: offerPrice }
      : { action: "keep", because: "already captured for this month" };
  }

  // Rules 4 and 5: both are somebody deciding, not a side effect.
  return { action: "replace", price: offerPrice };
}

/**
 * Whether to offer the "Use the current price" button, and what it says.
 *
 * Only where it would do something: an unpublished month, with a price
 * captured, where the offer's price has since moved. On a published month
 * there is nothing to offer, which is the point.
 */
export function priceCorrection({
  stored,
  published,
  offerPrice,
}: {
  stored: Figure;
  published: boolean;
  offerPrice: Figure;
}): { offer: boolean; current: number | null } {
  const current = offerPrice ?? null;
  const offer =
    !published &&
    stored !== null &&
    stored !== undefined &&
    current !== null &&
    current !== stored;

  return { offer, current };
}
