import assert from "node:assert/strict";
import { test } from "node:test";

import { publishWarning } from "./publish-warning.ts";

test("Dom's sentence, to the word", () => {
  assert.equal(
    publishWarning(["2026-08-01"], "2026-09-01"),
    "August 2026 is still a draft. Publish it first, or September 2026 will " +
      "be compared against unfinished figures.",
  );
});

test("more than one reads as a person would say it", () => {
  assert.equal(
    publishWarning(["2026-09-01", "2026-08-01"], "2026-10-01"),
    "August 2026 and September 2026 are still drafts. Publish them first, " +
      "or October 2026 will be compared against unfinished figures.",
  );
  assert.match(
    publishWarning(["2026-07-01", "2026-09-01", "2026-08-01"], "2026-10-01") ?? "",
    /^July 2026, August 2026 and September 2026 are still drafts/,
  );
});

test("nothing is said when every earlier month has gone out", () => {
  // The common case by a long way, and a warning that appeared every month
  // would stop being read by the second one.
  assert.equal(publishWarning([], "2026-09-01"), null);
});

test("oldest first, whatever order they arrive in", () => {
  assert.match(
    publishWarning(["2026-12-01", "2026-08-01"], "2027-01-01") ?? "",
    /^August 2026 and December 2026/,
  );
});
