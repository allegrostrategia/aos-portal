import assert from "node:assert/strict";
import { test } from "node:test";

import { launchIsLocked, launchIsRunning, launchLastDay, monthIsLocked } from "./locked.ts";

/**
 * When a launch is closed to edits.
 *
 * **The screen half of `report_launch_is_locked()`, and the two have to
 * agree exactly** — a form that submits into a refusal reads as the app
 * being broken, and one that refuses where the database would not reads
 * as the app being wrong. So every case here is written the way the SQL
 * decides it: published, retainer, and past the last day any stage
 * carries.
 *
 * Nina, 3 November: she updates a launch daily while it runs. Decision
 * 18 locked a published launch to everything but its status. Both are
 * right, because a published launch is a scoreboard during the launch
 * and a report after it.
 */

const retainer = { kind: "retainer" as const };
const member = { kind: "aos_member" as const };
const PUBLISHED = "2026-09-01T10:00:00Z";

const stage = (dates: Partial<Record<"promo_start" | "promo_end" | "live_start" | "live_end", string>>) => ({
  promo_start: dates.promo_start ?? null,
  promo_end: dates.promo_end ?? null,
  live_start: dates.live_start ?? null,
  live_end: dates.live_end ?? null,
});

test("the last day is the latest date any stage carries", () => {
  assert.equal(
    launchLastDay([
      stage({ promo_start: "2026-09-14", promo_end: "2026-09-18" }),
      stage({ live_start: "2026-09-19", live_end: "2026-09-20" }),
      stage({ promo_start: "2026-09-21", promo_end: "2026-10-02" }),
    ]),
    "2026-10-02",
  );

  // A half-filled stage needs no special case, and neither does a stage
  // whose promo runs past its live window.
  assert.equal(launchLastDay([stage({ promo_start: "2026-09-14" })]), "2026-09-14");
  assert.equal(
    launchLastDay([stage({ live_end: "2026-09-20", promo_end: "2026-09-30" })]),
    "2026-09-30",
  );

  assert.equal(launchLastDay([]), null, "no stages at all");
  assert.equal(launchLastDay([stage({})]), null, "a stage with no dates on it");
});

test("a running launch is editable, and locks the day after it ends", () => {
  const stages = [stage({ promo_start: "2026-09-14", live_end: "2026-10-02" })];
  const lastDay = launchLastDay(stages);

  assert.equal(
    launchIsLocked(retainer, PUBLISHED, lastDay, "2026-09-20"),
    false,
    "mid-launch",
  );
  // **The last day is still a day she is typing into it.** The
  // comparison is strictly-after for exactly this.
  assert.equal(
    launchIsLocked(retainer, PUBLISHED, lastDay, "2026-10-02"),
    false,
    "the day it ends",
  );
  assert.equal(
    launchIsLocked(retainer, PUBLISHED, lastDay, "2026-10-03"),
    true,
    "the morning after",
  );
});

test("a launch with no dates locks on publish, deliberately", () => {
  // Nothing says when it stops, and a report that silently never locks
  // is worse than one that locks early. Unpublish, fix, republish still
  // works, so nothing is trapped.
  assert.equal(launchIsLocked(retainer, PUBLISHED, null, "2026-09-20"), true);
  assert.equal(launchIsLocked(retainer, PUBLISHED, launchLastDay([stage({})]), "2026-09-20"), true);
});

test("an unpublished launch is never locked, whatever its dates say", () => {
  assert.equal(launchIsLocked(retainer, null, "2026-10-02", "2026-11-30"), false);
  assert.equal(launchIsLocked(retainer, null, null, "2026-11-30"), false);
});

test("and a self-serve launch is never locked at all", () => {
  // Their own work, visible to them from the moment they type it, and
  // they are their own editor — a lock would shut them out behind a
  // button only an admin can press.
  assert.equal(launchIsLocked(member, PUBLISHED, null, "2026-11-30"), false);
  assert.equal(launchIsLocked(member, PUBLISHED, "2026-01-01", "2026-11-30"), false);
});

test("running is not merely the opposite of locked", () => {
  // A draft is not locked either, and a draft is not running: the line
  // on the client's report would be saying a published thing about an
  // unpublished one.
  assert.equal(launchIsRunning(retainer, null, "2026-10-02", "2026-09-20"), false);
  assert.equal(launchIsRunning(retainer, PUBLISHED, "2026-10-02", "2026-09-20"), true);
  assert.equal(launchIsRunning(retainer, PUBLISHED, "2026-10-02", "2026-10-02"), true);
  assert.equal(launchIsRunning(retainer, PUBLISHED, "2026-10-02", "2026-10-03"), false);
  // No dates: locked on publish, so there is nothing to say "live until"
  // about either.
  assert.equal(launchIsRunning(retainer, PUBLISHED, null, "2026-09-20"), false);
  assert.equal(launchIsRunning(member, PUBLISHED, "2026-10-02", "2026-09-20"), false);
});

test("a month is unaffected by any of this", () => {
  // Months have no dates to be inside: a month IS the period. Asserted
  // here because the two lock functions sit beside each other and the
  // temptation to make them the same shape is real.
  assert.equal(monthIsLocked(retainer, PUBLISHED), true);
  assert.equal(monthIsLocked(retainer, null), false);
  assert.equal(monthIsLocked(member, PUBLISHED), false);
});
