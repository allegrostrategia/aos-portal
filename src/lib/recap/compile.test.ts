import assert from "node:assert/strict";
import { test } from "node:test";

import { compileRecapSource, type RecapSource } from "./compile.ts";

const FULL: RecapSource = {
  memberName: "Ruth Bell",
  month: "2026-09-01",
  loggedMinutes: 1120, // 18h 40m
  byCategory: [
    { label: "Delivery", minutes: 620 },
    { label: "Admin", minutes: 500 },
  ],
  weeksSignedOff: 4,
  hoursReclaimedThisMonth: 6,
  hoursReclaimedTotal: 52.5,
  milestonesCrossed: [{ target: 50, weekStart: "2026-09-07" }],
  actionsDone: [
    { label: "Rebuild the enquiry follow-up", monthTitle: "Month 2 — Systems" },
    { label: "Write the pricing page", monthTitle: null },
  ],
  builds: [{ title: "Enquiry follow-up automation", hoursPerWeek: 2.5 }],
  hotSeatChallenge: "Stop rewriting the same quote email twice a week.",
  reflections: [
    { weekStart: "2026-09-07", body: "  Exhausted but the new system is holding.  " },
    { weekStart: "2026-09-14", body: "Nearly cancelled a client. Didn't." },
  ],
};

const EMPTY: RecapSource = {
  memberName: "Omar Diaz",
  month: "2026-09-01",
  loggedMinutes: 0,
  byCategory: [],
  weeksSignedOff: 0,
  hoursReclaimedThisMonth: 0,
  hoursReclaimedTotal: 0,
  milestonesCrossed: [],
  actionsDone: [],
  builds: [],
  hotSeatChallenge: null,
  reflections: [],
};

test("the header names the member and the month in words", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /Ruth Bell · September 2026/);
});

test("time reads as hours and minutes, not a minute count", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /18h 40m logged/);
  assert.match(out, /Delivery: 10h 20m/);
  assert.match(out, /Admin: 8h 20m/);
  assert.match(out, /4 weeks signed off/);
});

test("a whole number of hours drops the minutes, and under an hour drops the hours", () => {
  const out = compileRecapSource({
    ...FULL,
    loggedMinutes: 120,
    byCategory: [{ label: "Admin", minutes: 45 }],
    weeksSignedOff: 1,
  });
  assert.match(out, /2h logged/);
  assert.match(out, /Admin: 45m/);
  assert.match(out, /1 week signed off/);
});

test("hours reclaimed carry their unit and the running total", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /6 hrs banked this month/);
  assert.match(out, /52\.5 hrs since they joined/);
});

test("a milestone says which week it was crossed in", () => {
  assert.match(compileRecapSource(FULL), /Passed 50 hours in the week of 7 September 2026/);
});

test("actions are counted in the heading and named under it", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /ROADMAP ACTIONS COMPLETED \(2\)/);
  assert.match(out, /Rebuild the enquiry follow-up \(Month 2 — Systems\)/);
  // No roadmap month set is a dash-free line, not "— null".
  assert.match(out, /Write the pricing page\n/);
  assert.doesNotMatch(out, /null/);
});

test("the build carries what it's worth a week, and the hot seat it came from", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /Enquiry follow-up automation — worth 2\.5 hrs a week/);
  assert.match(out, /"Stop rewriting the same quote email twice a week\."/);
});

test("a build with no rate set says so rather than claiming zero", () => {
  const out = compileRecapSource({
    ...FULL,
    builds: [{ title: "Client onboarding pack", hoursPerWeek: null }],
  });
  assert.match(out, /Client onboarding pack \(no weekly rate set\)/);
  assert.doesNotMatch(out, /worth 0 hrs/);
});

// The whole reason this is a pure function: a month with nothing in it must
// say so section by section. A missing section reads as an oversight, and the
// draft written from it will quietly claim something that didn't happen.
test("an empty month states every zero rather than dropping the section", () => {
  const out = compileRecapSource(EMPTY);
  assert.match(out, /0m logged/);
  assert.match(out, /0 weeks signed off/);
  assert.match(out, /No categories tracked this month\./);
  assert.match(out, /0 hrs banked this month/);
  assert.match(out, /MILESTONES CROSSED\n {2}None this month\./);
  assert.match(out, /ROADMAP ACTIONS COMPLETED \(0\)\n {2}None ticked off this month\./);
  assert.match(out, /No build confirmed this month\./);
  assert.match(out, /Nothing written this month\./);
});

// Rule 6: the reflections are the member's own, read by Nina alone. This text
// gets pasted into another window, so the label has to travel with it.
test("the reflections carry their privacy label wherever the block is pasted", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /THEIR OWN WORDS — PRIVATE FRIDAY REFLECTIONS/);
  assert.match(out, /for Nina\n {2}alone/);
  assert.match(out, /never posted into a shared room/);
});

test("each reflection is quoted under its own week, trimmed", () => {
  const out = compileRecapSource(FULL);
  assert.match(out, /Week of 7 September 2026:\n {2}"Exhausted but the new system is holding\."/);
  assert.match(out, /Week of 14 September 2026:/);
});

test("nothing in the block interprets the month", () => {
  const out = compileRecapSource(FULL).toLowerCase();
  for (const word of ["great", "well done", "congratulations", "impressive", "should"]) {
    assert.ok(!out.includes(word), `the compiler editorialised: ${word}`);
  }
});
