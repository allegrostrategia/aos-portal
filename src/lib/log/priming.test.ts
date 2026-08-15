import assert from "node:assert/strict";
import { test } from "node:test";

import { PRIMING, primingForWeek } from "./priming.ts";

// Wednesday 12 August 2026 — week 2 of the month, a valid intake week.
const JOINED = "2026-08-12";

test("each onboarding week gets its own piece, in order", () => {
  assert.equal(primingForWeek(JOINED, "2026-08-12")?.week, 2); // tracking I
  assert.equal(primingForWeek(JOINED, "2026-08-18")?.week, 3); // tracking II
  assert.equal(primingForWeek(JOINED, "2026-08-25")?.week, 4); // the 1:1 week
});

test("any day of the week shows that week's piece", () => {
  // Monday through Sunday of tracking week two.
  for (const day of [
    "2026-08-17",
    "2026-08-19",
    "2026-08-23",
  ]) {
    assert.equal(primingForWeek(JOINED, day)?.week, 3, `failed on ${day}`);
  }
});

test("nothing before onboarding starts, or after it ends", () => {
  assert.equal(primingForWeek(JOINED, "2026-08-05"), null); // week before
  assert.equal(primingForWeek(JOINED, "2026-09-01"), null); // after the 1:1 week
});

test("a member with no start date gets nothing rather than a crash", () => {
  assert.equal(primingForWeek(null, "2026-08-12"), null);
});

test("the copy is universal — no personalisation tokens crept in", () => {
  // §1: the same three pieces for everyone. A placeholder here would mean
  // someone had started tailoring it, which needs diagnostic logic that
  // deliberately doesn't exist yet.
  for (const piece of Object.values(PRIMING)) {
    const text = [piece.title, ...piece.body].join(" ");
    assert.ok(!/\{\{|\}\}|\$\{/.test(text), `${piece.week} contains a template token`);
    assert.ok(piece.body.length >= 2, `${piece.week} is too thin to be worth a card`);
  }
});
