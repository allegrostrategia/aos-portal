import assert from "node:assert/strict";
import { test } from "node:test";

import { lightFor } from "./lights.ts";
import { trafficLight } from "./formulas.ts";

/**
 * The light, and the words beside it.
 *
 * The colour is `trafficLight()`'s and has its own tests. What is tested
 * here is the one thing that can go wrong when two functions decide
 * related things separately: **the label disagreeing with the colour** —
 * a figure called off track against its target when the colour was
 * actually worked out from last month.
 */

test("it names whichever of the three was used, in the same order", () => {
  assert.deepEqual(
    lightFor({ value: 90, target: 100, benchmark: 50, lastMonth: 10, goodDirection: "up" }),
    { tone: "amber", against: "target" },
  );
  assert.deepEqual(
    lightFor({ value: 90, benchmark: 50, lastMonth: 10, goodDirection: "up" }),
    { tone: "green", against: "benchmark" },
  );
  assert.deepEqual(
    lightFor({ value: 90, lastMonth: 10, goodDirection: "up" }),
    { tone: "green", against: "last month" },
  );
});

test("a target of zero is not a target, and the label agrees", () => {
  // trafficLight() skips a zero target; a label that still said "target"
  // would be describing a comparison nobody made.
  const light = lightFor({ value: 5, target: 0, lastMonth: 4, goodDirection: "up" });
  assert.equal(light?.against, "last month");
});

test("nothing to compare against is no light at all", () => {
  assert.equal(lightFor({ value: 90, goodDirection: "up" }), null);
  assert.equal(lightFor({ value: null, target: 10, goodDirection: "up" }), null);
  assert.equal(
    lightFor({ value: 90, target: 10, goodDirection: "none" }),
    null,
    "a figure that is neither good up nor good down cannot be off track",
  );
});

test("the colour is always the formula module's, never a second opinion", () => {
  // The guard against this drifting into a reimplementation.
  for (const input of [
    { value: 120, target: 100, goodDirection: "up" as const },
    { value: 80, target: 100, goodDirection: "up" as const },
    { value: 50, target: 100, goodDirection: "up" as const },
    { value: 90, benchmark: 100, goodDirection: "down" as const },
    { value: 11, lastMonth: 10, goodDirection: "down" as const },
  ]) {
    assert.equal(lightFor(input)?.tone ?? null, trafficLight(input));
  }
});
