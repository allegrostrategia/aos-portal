import assert from "node:assert/strict";
import { test } from "node:test";

import { inMonth, parseExportDate } from "./dates.ts";

/**
 * §10's two date formats, which the two Meta exports disagree about.
 */

test("the content export is month first, the ads export is year first", () => {
  // 3 April, read the way each file means it.
  assert.equal(parseExportDate("04/03/2026", "us"), "2026-04-03");
  assert.equal(parseExportDate("2026-04-03", "iso"), "2026-04-03");
});

test("the ambiguous ones are read by the file, never by the value", () => {
  // The twelve days a year this matters. Both readings are valid dates,
  // so a parser that guessed would be silently wrong rather than
  // obviously wrong.
  assert.equal(parseExportDate("03/04/2026", "us"), "2026-03-04", "4 March in a US file");
  assert.equal(parseExportDate("2026-03-04", "iso"), "2026-03-04");
  // And a US file is not read as ISO just because it could be.
  assert.equal(parseExportDate("2026-03-04", "us"), null);
  assert.equal(parseExportDate("03/04/2026", "iso"), null);
});

test("the time Meta appends to a publish date is dropped", () => {
  assert.equal(parseExportDate("09/14/2026 08:30:00", "us"), "2026-09-14");
  assert.equal(parseExportDate("2026-09-14T08:30:00", "iso"), "2026-09-14");
});

test("a well-shaped date that does not exist is not one", () => {
  assert.equal(parseExportDate("02/31/2026", "us"), null, "31 February");
  assert.equal(parseExportDate("2026-02-30", "iso"), null);
  assert.equal(parseExportDate("13/01/2026", "us"), null, "month 13");
  // And a leap day that does exist is kept.
  assert.equal(parseExportDate("02/29/2028", "us"), "2028-02-29");
  assert.equal(parseExportDate("2026-02-29", "iso"), null, "2026 is not a leap year");
});

test("nothing unparseable becomes a date", () => {
  for (const bad of ["", "   ", "not a date", "14/09/26", "2026/09/14", undefined]) {
    assert.equal(parseExportDate(bad, "us"), null, `"${bad}" in a US file`);
    assert.equal(parseExportDate(bad, "iso"), null, `"${bad}" in an ISO file`);
  }
});

test("a row outside the report month is outside it, and so is a bad date", () => {
  assert.equal(inMonth("2026-09-30", "2026-09-01"), true);
  assert.equal(inMonth("2026-10-01", "2026-09-01"), false);
  assert.equal(inMonth("2026-08-31", "2026-09-01"), false);
  // A date that could not be read counts as outside, so it is left out
  // of the figures rather than quietly counted into them.
  assert.equal(inMonth(null, "2026-09-01"), false);
});
