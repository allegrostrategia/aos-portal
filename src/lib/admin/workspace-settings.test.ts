import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The one rule in saveWorkspaceSettings worth a test on its own: moving a
 * client's first month forward past figures that already exist.
 *
 * The month picker only offers months from `first_month` onwards, so those
 * figures would stay in the database and vanish from every screen — the
 * worst kind of data loss, because nothing is deleted and nothing warns.
 */

/** Mirrors the comparison in the action; both are plain `YYYY-MM-DD` strings. */
function wouldHideFigures(earliestWithData: string | null, newFirstMonth: string): boolean {
  if (!earliestWithData) return false;
  return earliestWithData < newFirstMonth;
}

test("moving the first month later than existing figures is refused", () => {
  assert.equal(wouldHideFigures("2026-08-01", "2026-09-01"), true);
});

test("moving it earlier is fine — it only widens what the picker offers", () => {
  assert.equal(wouldHideFigures("2026-08-01", "2026-07-01"), false);
  assert.equal(wouldHideFigures("2026-08-01", "2026-08-01"), false);
});

test("a client with no figures yet can have it set to anything", () => {
  // Which is the case this exists for: the first test client was created
  // with its first month set to the month it was made in, so no completed
  // month was selectable and there was no way to correct it.
  assert.equal(wouldHideFigures(null, "2026-08-01"), false);
});

test("string comparison is enough, because months are stored as YYYY-MM-01", () => {
  // Across a year end, where a naive month-number comparison would be wrong.
  assert.equal(wouldHideFigures("2026-12-01", "2027-01-01"), true);
  assert.equal(wouldHideFigures("2027-01-01", "2026-12-01"), false);
});
