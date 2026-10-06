import assert from "node:assert/strict";
import { test } from "node:test";

import { monthsSeen, normalise, provenness, type TopItem } from "./top-items.ts";

const hook = (month: string, body: string, rank = 1): TopItem => ({
  month,
  item_type: "hook",
  rank,
  body,
  views: null,
});

test("the same hook typed again is the same hook", () => {
  // It is retyped each month, so the comparison forgives what is not the
  // hook: surrounding space, capitals, a double space in the middle.
  assert.equal(normalise("  The One Thing   nobody tells you "), "the one thing nobody tells you");
});

test("two hooks that differ by a word are two hooks", () => {
  const history = [
    hook("2026-07-01", "The one thing nobody tells you"),
    hook("2026-08-01", "The one thing nobody told you"),
  ];
  assert.equal(provenness(history[0], history).months, 1);
  assert.equal(provenness(history[0], history).proven, false);
});

test("proven means two months, not two appearances", () => {
  const history = [
    hook("2026-07-01", "Stop doing this"),
    hook("2026-08-01", "Stop doing this", 2),
  ];
  const verdict = provenness(history[0], history);
  assert.equal(verdict.months, 2);
  assert.equal(verdict.proven, true);
});

test("twice in one month is still one month", () => {
  // The unique index forbids it, but data arrives by other routes than
  // the screen and a count of rows would say "proven" for a typo.
  const history = [
    hook("2026-07-01", "Stop doing this", 1),
    hook("2026-07-01", "stop doing this", 2),
  ];
  assert.equal(provenness(history[0], history).months, 1);
  assert.equal(provenness(history[0], history).proven, false);
});

test("a hook and a b-roll with the same words are different things", () => {
  const history: TopItem[] = [
    { month: "2026-07-01", item_type: "hook", rank: 1, body: "Walking shot", views: null },
    { month: "2026-08-01", item_type: "b_roll", rank: 1, body: "Walking shot", views: null },
  ];
  assert.equal(provenness(history[0], history).months, 1, "the hook has one month");
  assert.equal(provenness(history[1], history).months, 1, "and so does the b-roll");
});

test("an empty line is never proven, however often it is left blank", () => {
  const history = [hook("2026-07-01", "   "), hook("2026-08-01", "")];
  assert.equal(provenness(history[0], history).proven, false);
  assert.equal(monthsSeen(history).size, 0, "blanks are not items");
});

test("three months reads as three, because the screen says so", () => {
  const history = [
    hook("2026-07-01", "Stop doing this"),
    hook("2026-08-01", "Stop doing this"),
    hook("2026-09-01", "STOP DOING THIS"),
  ];
  assert.equal(provenness(history[0], history).months, 3);
});
