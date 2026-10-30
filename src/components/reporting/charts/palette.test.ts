import test from "node:test";
import assert from "node:assert/strict";

import { LINE_SERIES, SPARK_STROKE, sparkFill, sparkStroke } from "./palette.ts";

/**
 * A sparkline's colour comes from its card's disc — but only ever through
 * the inks that pass.
 *
 * The failure this exists for is a well-meant one: the discs are gold,
 * blush, sky and orange, and the obvious "fix" is to draw each sparkline in
 * that exact hue so it matches. On the white reporting card a gold line is
 * 1.41:1 and a blush one 1.73:1 — present in the DOM, effectively invisible
 * on the screen, and nothing in the stack complains. So this asserts the
 * mapping lands on the checked set rather than on the brand variables.
 */

const PASSING = new Set<string>(LINE_SERIES.map((s) => s.stroke));

/** Every disc tone, including the one the rotation never reaches for. */
const TONES = ["gold", "blush", "sky", "orange", "lemon"] as const;

test("every disc tone draws in an ink that clears 3:1", () => {
  const bad = TONES.filter((tone) => !PASSING.has(sparkStroke(tone)));
  assert.deepEqual(
    bad,
    [],
    "a sparkline may only be drawn in a LINE_SERIES ink — " +
      "check-chart-palette.mjs is what says those pass",
  );
});

test("it is not a brand variable sneaking through", () => {
  // The specific regression: `gold: "var(--aos-gold)"` would satisfy a
  // weaker test that only checked the tones differ from each other.
  for (const tone of TONES) {
    const stroke = sparkStroke(tone);
    assert.ok(
      !/--aos-(gold|blush|sky|orange)\b/.test(stroke),
      `${tone} draws in ${stroke}, which is the disc's fill, not its ink`,
    );
  }
});

test("the tones map where the contrast check allows, not where taste would", () => {
  // Gold and lemon have no legible line form at all, so both fall to navy;
  // blush has none either and takes orange's, which is the nearest of the
  // three that exist. Written out so a change to the mapping is a change
  // somebody made on purpose.
  assert.equal(sparkStroke("gold"), "var(--aos-navy)");
  assert.equal(sparkStroke("lemon"), "var(--aos-navy)");
  assert.equal(sparkStroke("blush"), sparkStroke("orange"));
  assert.notEqual(sparkStroke("sky"), sparkStroke("orange"));
});

test("a card with no disc gets navy", () => {
  assert.equal(sparkStroke(), SPARK_STROKE);
  assert.equal(SPARK_STROKE, "var(--aos-navy)");
});

test("the wash is mixed from the same ink the line is drawn in", () => {
  // Not from a second, hard-coded navy: a blue wash under an orange line
  // is the bug this catches, and it looks like a smudge rather than a
  // mistake.
  for (const tone of TONES) {
    assert.ok(
      sparkFill(tone).includes(sparkStroke(tone)),
      `${tone}: ${sparkFill(tone)} is not mixed from ${sparkStroke(tone)}`,
    );
  }
  assert.match(sparkFill("sky"), /^color-mix\(in oklab, .+ 12%, transparent\)$/);
});
