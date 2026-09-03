import assert from "node:assert/strict";
import { test } from "node:test";

import { initials } from "./initials.ts";

test("initials use the first and last name", () => {
  assert.equal(initials("Fran Doyle"), "FD");
  assert.equal(initials("Erin Vale"), "EV");
});

test("a middle name doesn't add a third letter", () => {
  assert.equal(initials("Maria Luisa Rossi"), "MR");
});

test("a single name gives one letter", () => {
  assert.equal(initials("Nina"), "N");
});

test("accents and non-Latin names survive rather than becoming question marks", () => {
  assert.equal(initials("Ángela Ruiz"), "ÁR");
  assert.equal(initials("Đorđe Petrović"), "ĐP");
});

test("a character outside the basic plane isn't sliced in half", () => {
  // Those two above are single UTF-16 units and would pass with charAt as well.
  // This one is a surrogate pair: charAt would return half of it, which renders
  // as a replacement glyph rather than a letter.
  assert.equal(initials("𝒜melia Stone"), "𝒜S");
});

test("extra whitespace doesn't produce empty initials", () => {
  assert.equal(initials("  Fran   Doyle  "), "FD");
});

test("an empty name falls back rather than rendering nothing", () => {
  assert.equal(initials(""), "?");
  assert.equal(initials("   "), "?");
});
