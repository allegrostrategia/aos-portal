import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLaunchRange, launchFirstDay, launchRange } from "./launch-dates.ts";

/**
 * "14 Sept - 2 Oct 2026" under a launch's name.
 *
 * Nina, 3 November. A launch is the one thing in the reporting tool
 * that does not live inside a month, and the heading above these cards
 * says a month — so without the range, a launch promoted in September
 * and sold in October reads as a September launch.
 */

const stage = (dates: Partial<Record<"promo_start" | "promo_end" | "live_start" | "live_end", string>>) => ({
  promo_start: dates.promo_start ?? null,
  promo_end: dates.promo_end ?? null,
  live_start: dates.live_start ?? null,
  live_end: dates.live_end ?? null,
});

test("first promo to last stage, across every stage", () => {
  const stages = [
    stage({ promo_start: "2026-09-14", promo_end: "2026-09-18" }),
    stage({ live_start: "2026-09-19", live_end: "2026-09-20" }),
    stage({ promo_start: "2026-09-21", promo_end: "2026-10-02" }),
  ];
  assert.equal(launchFirstDay(stages), "2026-09-14");
  assert.equal(launchRange(stages), "14 Sept - 2 Oct 2026");
});

test("the year appears once, unless the launch crosses one", () => {
  assert.equal(
    formatLaunchRange("2026-12-27", "2027-01-14"),
    "27 Dec 2026 - 14 Jan 2027",
    "a January launch promoted in December",
  );
  assert.equal(formatLaunchRange("2026-09-14", "2026-10-02"), "14 Sept - 2 Oct 2026");
});

test("a one-day launch is a date, not a range", () => {
  assert.equal(formatLaunchRange("2026-09-14", "2026-09-14"), "14 Sept 2026");
  assert.equal(launchRange([stage({ live_start: "2026-09-14", live_end: "2026-09-14" })]), "14 Sept 2026");
});

test("nothing at all while a launch has no dates", () => {
  // A launch still being planned shows no line rather than a line with
  // a dash in it.
  assert.equal(launchRange([]), null);
  assert.equal(launchRange([stage({})]), null);
  assert.equal(formatLaunchRange(null, "2026-10-02"), null);
});

test("the date is the date, whatever the machine's clock is set to", () => {
  // Written as a date and printed as that date: no Date is built from a
  // local-time string anywhere in here, which is the bug this would
  // otherwise have — "14 Sep" printing as "13 Sep" west of Greenwich.
  assert.equal(formatLaunchRange("2026-01-01", "2026-01-01"), "1 Jan 2026");
  assert.equal(formatLaunchRange("2026-12-31", "2026-12-31"), "31 Dec 2026");
});
