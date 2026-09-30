import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASH,
  changeTone,
  formatChange,
  formatValue,
  fromInputValue,
  toInputValue,
} from "./format.ts";

test("a missing figure is a dash, everywhere", () => {
  // §4: "shows a dash, never an error or 0%."
  for (const unit of ["count", "currency", "percent", "hours", "ratio", "months"] as const) {
    assert.equal(formatValue(null, unit), DASH);
    assert.equal(formatValue(undefined, unit), DASH);
    assert.equal(formatValue(Number.NaN, unit), DASH);
    assert.equal(formatValue(Number.POSITIVE_INFINITY, unit), DASH);
  }
});

test("a real zero is not a dash", () => {
  // "0 new clients" is an answer. Hiding it would turn a bad month into a
  // blank one, which is the opposite of what this tool is for.
  assert.equal(formatValue(0, "count"), "0");
  assert.equal(formatValue(0, "currency"), "£0");
  assert.equal(formatValue(0, "percent"), "0.0%");
});

test("money is whole pounds, with thousands separated", () => {
  assert.equal(formatValue(24850, "currency"), "£24,850");
  assert.equal(formatValue(1320.4, "currency"), "£1,320");
});

test("negative money puts the sign before the symbol", () => {
  assert.equal(formatValue(-400, "currency"), "−£400");
});

test("the currency follows the workspace", () => {
  assert.equal(formatValue(2500, "currency", "USD"), "$2,500");
  assert.equal(formatValue(2500, "currency", "EUR"), "€2,500");
  // An unknown code still prints something readable rather than nothing.
  assert.equal(formatValue(2500, "currency", "AUD"), "AUD 2,500");
});

test("rates get one decimal, counts get none", () => {
  assert.equal(formatValue(6.94, "percent"), "6.9%");
  assert.equal(formatValue(8386.36, "count"), "8,386");
  assert.equal(formatValue(2.14, "ratio"), "2.1");
  assert.equal(formatValue(96, "hours"), "96.0h");
  assert.equal(formatValue(3, "months"), "3.0 months");
});

test("an arrow shows the movement", () => {
  assert.equal(formatChange(18), "↑ 18%");
  assert.equal(formatChange(-22), "↓ 22%");
  assert.equal(formatChange(0), "→ 0%");
  assert.equal(formatChange(null), null);
  // Small movements keep a decimal, so 0.8% does not print as 1%.
  assert.equal(formatChange(0.8), "↑ 0.8%");
});

test("the colour comes from the metric, not from the arrow", () => {
  // A fall in unsubscribes is good news; a rise in costs is not. Reading the
  // meaning off the sign alone is how a report congratulates someone on
  // their costs going up.
  assert.equal(changeTone(18, "up"), "good");
  assert.equal(changeTone(-18, "up"), "bad");
  assert.equal(changeTone(-18, "down"), "good");
  assert.equal(changeTone(18, "down"), "bad");
});

test("no colour where there is no such thing as good", () => {
  // Ad spend, the lead source split — §5's "n/a" column.
  assert.equal(changeTone(18, "none"), "neutral");
  assert.equal(changeTone(0, "up"), "neutral");
  assert.equal(changeTone(null, "up"), null);
});

test("an input holds a raw number, not a formatted one", () => {
  // "24,850" in a number input is something the browser will not parse and
  // the person cannot comfortably edit.
  assert.equal(toInputValue(24850), "24850");
  assert.equal(toInputValue(0), "0");
  assert.equal(toInputValue(null), "", "blank, not a zero nobody entered");
});

test("blank comes back as not-entered, not as zero", () => {
  assert.equal(fromInputValue(""), null);
  assert.equal(fromInputValue("   "), null);
  assert.equal(fromInputValue("0"), 0, "a typed zero is a real figure");
});

test("a pasted number survives its thousands separators", () => {
  // People paste out of a spreadsheet or a dashboard.
  assert.equal(fromInputValue("24,850"), 24850);
  assert.equal(fromInputValue(" 1320.40 "), 1320.4);
});

test("nonsense in a number box is not entered rather than NaN", () => {
  assert.equal(fromInputValue("about a thousand"), null);
});
