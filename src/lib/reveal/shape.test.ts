import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_REVEAL,
  isRevealComplete,
  missingFromReveal,
  readPriorities,
} from "./shape.ts";

test("well-formed priorities read back in order", () => {
  const priorities = readPriorities([
    { title: "Rebuild your enquiry follow-up", body: "Because it's manual." },
    { title: "Batch your content", body: "" },
  ]);

  assert.equal(priorities.length, 2);
  assert.equal(priorities[0].title, "Rebuild your enquiry follow-up");
  assert.equal(priorities[1].body, "");
});

// This is handed to somebody in a meeting. A blank numbered card is worse than
// one fewer card.
test("a priority with no title is dropped, not rendered blank", () => {
  const priorities = readPriorities([
    { title: "Real one", body: "x" },
    { title: "   ", body: "orphaned body" },
    { body: "no title at all" },
  ]);
  assert.equal(priorities.length, 1);
});

test("garbage in the column doesn't throw", () => {
  for (const value of [null, undefined, "text", 42, {}, [null, 7]]) {
    assert.deepEqual(readPriorities(value), []);
  }
});

test("whitespace is trimmed rather than counted as content", () => {
  const priorities = readPriorities([{ title: "  Kept  ", body: "  Also  " }]);
  assert.deepEqual(priorities[0], { title: "Kept", body: "Also" });
});

test("an empty reveal lists everything still to write, in reading order", () => {
  assert.deepEqual(missingFromReveal(EMPTY_REVEAL), [
    "their own words",
    "what's working",
    "what isn't",
    "the priorities",
    "where their road starts",
  ]);
});

test("a complete reveal reports nothing missing", () => {
  const reveal = {
    ...EMPTY_REVEAL,
    inTheirWords: "I'm drowning in admin.",
    whatsWorking: "Referrals.",
    whatsNotWorking: "Follow-up.",
    priorities: [{ title: "Rebuild follow-up", body: "" }],
    roadNote: "Starting at Officina Vespa.",
  };
  assert.equal(isRevealComplete(reveal), true);
  assert.deepEqual(missingFromReveal(reveal), []);
});

// The hero meta is free text on purpose — "around 14 hrs/week on admin" is a
// better baseline than a number the product would have to defend.
test("baseline and start date aren't required to be complete", () => {
  const reveal = {
    ...EMPTY_REVEAL,
    inTheirWords: "a",
    whatsWorking: "b",
    whatsNotWorking: "c",
    priorities: [{ title: "d", body: "" }],
    roadNote: "e",
  };
  assert.equal(isRevealComplete(reveal), true);
});
