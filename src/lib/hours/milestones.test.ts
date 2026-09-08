import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MILESTONES,
  formatHours,
  milestoneJourney,
  milestonePathFraction,
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
  // 260 hours is just past 250, not 35% of the way to 750. Measuring from zero
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
  const p = milestoneProgress(900);
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
  // Deliberately not "unlock": nothing does, until rewards are scoped.
  assert.equal(milestoneLine(62), "62 hrs · 38 to your next milestone");
  assert.equal(milestoneLine(750), "750 hrs · every milestone passed");
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

// --- the journey ----------------------------------------------------------

test("an empty ledger is a journey that hasn't started", () => {
  const journey = milestoneJourney([]);
  assert.equal(journey.total, 0);
  assert.deepEqual(journey.weeks, []);
  assert.equal(journey.steps[0].reached, false);
  assert.equal(journey.steps[0].toGo, 50);
});

test("the running total accumulates week by week", () => {
  const journey = milestoneJourney([
    { weekStartDate: "2026-03-02", hours: 8 },
    { weekStartDate: "2026-03-09", hours: 8 },
    { weekStartDate: "2026-03-16", hours: 8 },
  ]);
  assert.deepEqual(journey.weeks.map((w) => w.runningTotal), [8, 16, 24]);
  assert.equal(journey.total, 24);
});

// The thing a progress bar can't say.
test("it records the week a threshold was crossed", () => {
  const journey = milestoneJourney([
    { weekStartDate: "2026-03-02", hours: 20 },
    { weekStartDate: "2026-03-09", hours: 20 },
    { weekStartDate: "2026-03-16", hours: 20 },
  ]);

  const fifty = journey.steps.find((s) => s.target === 50)!;
  assert.equal(fifty.reached, true);
  assert.equal(fifty.reachedInWeek, "2026-03-16");
});

test("landing exactly on a threshold counts as crossing it that week", () => {
  const journey = milestoneJourney([
    { weekStartDate: "2026-03-02", hours: 25 },
    { weekStartDate: "2026-03-09", hours: 25 },
  ]);
  assert.equal(journey.steps[0].reachedInWeek, "2026-03-09");
});

test("two thresholds crossed in one big week are both recorded", () => {
  const journey = milestoneJourney([{ weekStartDate: "2026-03-02", hours: 120 }]);
  assert.equal(journey.steps[0].reachedInWeek, "2026-03-02");
  assert.equal(journey.steps[1].reachedInWeek, "2026-03-02");
  assert.equal(journey.steps[2].reached, false);
});

test("a threshold not yet reached reports the distance, not a date", () => {
  const journey = milestoneJourney([{ weekStartDate: "2026-03-02", hours: 12.5 }]);
  const fifty = journey.steps.find((s) => s.target === 50)!;
  assert.equal(fifty.reachedInWeek, null);
  assert.equal(fifty.toGo, 38);
});

// The ledger is append-only so this answer stays true: a rate retired later
// must not move when a threshold was passed.
test("later weeks never change when an earlier threshold was crossed", () => {
  const early = [
    { weekStartDate: "2026-03-02", hours: 30 },
    { weekStartDate: "2026-03-09", hours: 30 },
  ];
  const crossedAt = milestoneJourney(early).steps[0].reachedInWeek;

  const withMore = milestoneJourney([
    ...early,
    { weekStartDate: "2026-03-16", hours: 500 },
  ]);
  assert.equal(withMore.steps[0].reachedInWeek, crossedAt);
});

// A week they showed up for and earned nothing is still a week they showed up.
test("a qualifying week worth zero hours is kept in the record", () => {
  const journey = milestoneJourney([
    { weekStartDate: "2026-03-02", hours: 0 },
    { weekStartDate: "2026-03-09", hours: 5 },
  ]);
  assert.equal(journey.weeks.length, 2);
  assert.equal(journey.weeks[0].runningTotal, 0);
});

// The road is a fair map of the journey, not of the hours — see the function.
test("the path fraction gives each milestone an equal share of the road", () => {
  assert.equal(milestonePathFraction(0), 0);
  assert.equal(milestonePathFraction(50), 0.2);
  assert.equal(milestonePathFraction(100), 0.4);
  assert.equal(milestonePathFraction(250), 0.6);
  assert.equal(milestonePathFraction(500), 0.8);
  assert.equal(milestonePathFraction(750), 1);
});

test("the path fraction moves within a band, so progress is visible between thresholds", () => {
  // Halfway from 50 to 100 is halfway along the road's second fifth.
  assert.equal(milestonePathFraction(75), 0.3);
  // And the long 500→750 stretch still moves: a quarter of the way through it.
  assert.equal(Math.round(milestonePathFraction(562.5) * 1000) / 1000, 0.85);
});

test("the path fraction never leaves the road", () => {
  for (const hours of [-100, 0, 1, 749, 750, 5000]) {
    const f = milestonePathFraction(hours);
    assert.ok(f >= 0 && f <= 1, `${hours} hrs gave ${f}`);
  }
});
