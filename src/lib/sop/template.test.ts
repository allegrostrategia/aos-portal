import assert from "node:assert/strict";
import { test } from "node:test";

import { isComplete, missingFrom, readSop } from "./template.ts";

test("a well-formed SOP reads back whole", () => {
  const sop = readSop({
    trigger: "A new client signs",
    outcome: "They're in the system and booked in",
    owner: "Client manager",
    tools: ["HeyClients", "Calendar"],
    video_url: "https://example.test/walkthrough",
    steps: [{ text: "Create the record" }, { text: "Send the welcome" }],
  });

  assert.equal(sop.trigger, "A new client signs");
  assert.equal(sop.steps.length, 2);
  assert.deepEqual(sop.tools, ["HeyClients", "Calendar"]);
  assert.equal(isComplete(sop), true);
});

// The column is jsonb, so anything could be in it. A bad row should render an
// incomplete SOP, not break the page an hour before somebody needs it.
test("garbage in the column doesn't throw", () => {
  for (const value of [null, undefined, "a string", 42, [], { steps: "nope" }]) {
    const sop = readSop(value);
    assert.deepEqual(sop.steps, []);
    assert.equal(sop.trigger, "");
  }
});

test("blank steps and tools are dropped rather than stored as gaps", () => {
  const sop = readSop({
    steps: [{ text: "Real" }, { text: "   " }, { notText: 1 }],
    tools: ["Notion", "", "   "],
  });
  assert.deepEqual(sop.steps, [{ text: "Real" }]);
  assert.deepEqual(sop.tools, ["Notion"]);
});

test("whitespace is trimmed, so a space isn't mistaken for an answer", () => {
  const sop = readSop({ trigger: "  A new client signs  ", owner: "   " });
  assert.equal(sop.trigger, "A new client signs");
  assert.equal(sop.owner, "");
});

test("an empty video link reads as none, not as an empty string", () => {
  assert.equal(readSop({ video_url: "   " }).video_url, null);
  assert.equal(readSop({}).video_url, null);
});

// Half-finished is normal — someone writes the steps and gets interrupted.
test("what's missing is listed in the member's own terms", () => {
  const missing = missingFrom(readSop({ trigger: "A new client signs" }));
  assert.deepEqual(missing, [
    "what done looks like",
    "the steps",
    "whose job it is",
  ]);
});

test("tools and a video are optional — an SOP is complete without them", () => {
  const sop = readSop({
    trigger: "A new client signs",
    outcome: "Booked in",
    owner: "Me",
    steps: [{ text: "Do the thing" }],
  });
  assert.equal(isComplete(sop), true);
});
