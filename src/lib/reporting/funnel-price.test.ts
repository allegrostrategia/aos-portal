import assert from "node:assert/strict";
import { test } from "node:test";

import { decidePrice, priceCorrection } from "./funnel-price.ts";

/**
 * The five rules a funnel month's price obeys.
 *
 * Written before the screens, because the one that matters most is a
 * negative: a published month does not change, and nothing a person can
 * press makes it.
 */

const JUNE_PUBLISHED = { published: true };
const DRAFT = { published: false };

test("the first save captures the offer's price", () => {
  assert.deepEqual(
    decidePrice({ stored: null, offerPrice: 500, reason: "save", ...DRAFT }),
    { action: "capture", price: 500 },
  );
});

test("a later save leaves it alone — December does not rewrite June", () => {
  // The case Dom caught in the plan: fixing a typo in June's figures in
  // December, after a price rise, must not swap June's £500 for £800.
  const decision = decidePrice({
    stored: 500,
    offerPrice: 800,
    reason: "save",
    ...DRAFT,
  });

  assert.equal(decision.action, "keep");
  assert.match(decision.because, /already captured/);
});

test("a published month never changes its price, by any route", () => {
  for (const reason of ["save", "use_current", "offer_changed"] as const) {
    const decision = decidePrice({
      stored: 500,
      offerPrice: 800,
      reason,
      ...JUNE_PUBLISHED,
    });
    assert.equal(decision.action, "keep", `"${reason}" moved a published month`);
    assert.match(decision.because, /published/);
  }
});

test("a published month with no price captured still does not capture one", () => {
  // A month published before the price was ever captured keeps its dash
  // rather than gaining a figure retrospectively.
  const decision = decidePrice({
    stored: null,
    offerPrice: 800,
    reason: "save",
    ...JUNE_PUBLISHED,
  });
  assert.equal(decision.action, "keep");
});

test("the button replaces it, on an unpublished month", () => {
  assert.deepEqual(
    decidePrice({ stored: 500, offerPrice: 800, reason: "use_current", ...DRAFT }),
    { action: "replace", price: 800 },
  );
});

test("pointing the funnel at another offer takes the new price", () => {
  assert.deepEqual(
    decidePrice({ stored: 500, offerPrice: 1200, reason: "offer_changed", ...DRAFT }),
    { action: "replace", price: 1200 },
  );
});

test("a funnel with no linked offer captures nothing", () => {
  for (const reason of ["save", "use_current", "offer_changed"] as const) {
    const decision = decidePrice({ stored: null, offerPrice: null, reason, ...DRAFT });
    assert.equal(decision.action, "keep");
    assert.match(decision.because, /no linked offer/);
  }
});

test("a captured price of zero is a price, not an absence", () => {
  // A free lead magnet is a real offer at £0, and it must not be
  // recaptured every month as though nothing had been stored.
  const decision = decidePrice({ stored: 0, offerPrice: 800, reason: "save", ...DRAFT });
  assert.equal(decision.action, "keep", "£0 was captured, so it stands");
});

// ---------------------------------------------------------------- the button

test("the correction is offered only where it would do something", () => {
  // Unpublished, captured, and the price has moved.
  assert.deepEqual(priceCorrection({ stored: 500, offerPrice: 800, ...DRAFT }), {
    offer: true,
    current: 800,
  });

  // The price has not moved.
  assert.equal(priceCorrection({ stored: 800, offerPrice: 800, ...DRAFT }).offer, false);

  // Published: there is nothing to offer, which is the point.
  assert.equal(
    priceCorrection({ stored: 500, offerPrice: 800, ...JUNE_PUBLISHED }).offer,
    false,
  );

  // Nothing captured yet: the next save will capture it anyway.
  assert.equal(priceCorrection({ stored: null, offerPrice: 800, ...DRAFT }).offer, false);

  // No linked offer: nothing to take.
  assert.equal(priceCorrection({ stored: 500, offerPrice: null, ...DRAFT }).offer, false);
});
