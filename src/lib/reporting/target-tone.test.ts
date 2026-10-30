import test from "node:test";
import assert from "node:assert/strict";

import { TARGET_TONE_FILL, targetTone } from "./format.ts";

/**
 * The four steps a target bar is coloured in, and the one that is easy to
 * get backwards.
 */

test("an up metric steps through the four tones", () => {
  assert.equal(targetTone(100, 100, "up"), "met");
  assert.equal(targetTone(130, 100, "up"), "met");
  assert.equal(targetTone(75, 100, "up"), "close");
  assert.equal(targetTone(99, 100, "up"), "close");
  assert.equal(targetTone(50, 100, "up"), "halfway");
  assert.equal(targetTone(74, 100, "up"), "halfway");
  assert.equal(targetTone(49, 100, "up"), "far");
  assert.equal(targetTone(0, 100, "up"), "far");
});

test("a DOWN metric is met by being under, not by reaching 100%", () => {
  // Cost per lead with a £10 target. £4 is the best news on the page, and
  // reading it as "40% of target, a long way off" is exactly backwards.
  assert.equal(targetTone(4, 10, "down"), "met");
  assert.equal(targetTone(10, 10, "down"), "met");
  assert.equal(targetTone(14, 10, "down"), "far");
});

test("nothing entered is not nothing achieved", () => {
  // A null reads as zero against the bar, which is what the bar shows.
  assert.equal(targetTone(null, 100, "up"), "far");
  // …and under a cost target, no spend really is under it.
  assert.equal(targetTone(null, 10, "down"), "met");
});

test("a zero target cannot divide, and does not crash", () => {
  assert.equal(targetTone(5, 0, "up"), "far");
});

test("every tone has a fill, and met is the green used for a good change", () => {
  for (const tone of ["met", "close", "halfway", "far"] as const) {
    assert.ok(TARGET_TONE_FILL[tone], `${tone} has no fill`);
  }
  assert.equal(TARGET_TONE_FILL.met, "#1f7a4d");
});
