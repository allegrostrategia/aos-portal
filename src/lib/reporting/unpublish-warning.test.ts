import assert from "node:assert/strict";
import { test } from "node:test";

import { unpublishWarning } from "./unpublish-warning.ts";

/**
 * The sentence Nina reads before taking a month back to draft.
 *
 * Dom's wording of 7 October, kept to the word in the single case, which
 * is the one she will almost always meet.
 */

test("Dom's sentence, to the word", () => {
  assert.equal(
    unpublishWarning(["2026-09-01"], true),
    "September 2026 uses figures from this month. It will show dashes until " +
      "you republish, and if you change anything here, republish September 2026 too.",
  );
});

test("more than one later month reads as a person would say it", () => {
  assert.equal(
    unpublishWarning(["2026-10-01", "2026-09-01"], true),
    "September 2026 and October 2026 use figures from this month. They will " +
      "show dashes until you republish, and if you change anything here, " +
      "republish them too.",
  );

  assert.match(
    unpublishWarning(["2026-11-01", "2026-09-01", "2026-10-01"], true) ?? "",
    /^September 2026, October 2026 and November 2026 use figures/,
  );
});

test("oldest first, whatever order they arrive in", () => {
  // `getPublishedMonths` returns newest first, which would otherwise read
  // backwards here.
  assert.match(
    unpublishWarning(["2026-12-01", "2026-09-01"], true) ?? "",
    /^September 2026 and December 2026/,
  );
});

test("nothing is said when there is nothing to warn about", () => {
  assert.equal(unpublishWarning([], true), null, "no later published month");
  assert.equal(
    unpublishWarning(["2026-09-01"], false),
    null,
    "this month holds no figures, so nothing is carried from it",
  );
  assert.equal(unpublishWarning([], false), null);
});
