import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MILESTONES,
  formatHours,
  milestoneLine,
  milestoneProgress,
} from "./milestones.ts";

test("a member with nothing yet is aimed at the first threshold", () => {
  const p = milestoneProgress(0);
  assert.deepEqual(p.reached, []);
  assert.equal(p.next, 50);
  assert.equal(p.toNext, 50);
  assert.equal(p.fraction, 0);
});

test("progress is measured from the previous threshold, not from zero", () => {
  // 260 hours is just past 250, not 52% of the way to 500. Measuring from zero
  // would make the final stretch look static for months.
  const p = milestoneProgress(260);
  assert.equal(p.next, 500);
  assert.equal(Math.round(p.fraction * 100), 4);
});

test("landing exactly on a threshold counts as reaching it", () => {
  const p = milestoneProgress(100);
  assert.deepEqual(p.reached, [50, 100]);
  assert.equal(p.next, 250);
  assert.equal(p.toNext, 150);
});

test("past the last threshold there is no next one", () => {
  const p = milestoneProgress(640);
  assert.deepEqual(p.reached, [...MILESTONES]);
  assert.equal(p.next, null);
  assert.equal(p.toNext, null);
  assert.equal(p.fraction, 1);
});

test("hours still to go round up, so it never reads as nagging over a fraction", () => {
  assert.equal(milestoneProgress(49.2).toNext, 1);
  assert.equal(milestoneProgress(49.9).toNext, 1);
});

test("the Piazza line matches the shape §2 asks for", () => {
  assert.equal(milestoneLine(62), "62 hrs · 38 to your next unlock");
  assert.equal(milestoneLine(500), "500 hrs · every milestone passed");
});

test("fractional totals are shown, not rounded up into a bigger claim", () => {
  assert.equal(formatHours(37.5), "37.5");
  assert.equal(formatHours(38), "38");
  assert.equal(formatHours(37.44), "37.4");
});

test("a negative total can't happen, and doesn't produce nonsense if it does", () => {
  const p = milestoneProgress(-10);
  assert.equal(p.next, 50);
  assert.equal(p.fraction, 0);
});
