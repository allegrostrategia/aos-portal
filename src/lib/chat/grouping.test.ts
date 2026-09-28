import assert from "node:assert/strict";
import { test } from "node:test";

import { endsGroup, startsGroup } from "./grouping.ts";

const at = (member_id: string, minute: number) => ({
  member_id,
  created_at: `2026-09-28T10:${String(minute).padStart(2, "0")}:00Z`,
});

test("the first message in a thread always opens a run", () => {
  assert.equal(startsGroup(undefined, at("nina", 0)), true);
});

test("the last message in a thread always closes one", () => {
  assert.equal(endsGroup(at("nina", 0), undefined), true);
});

test("a different sender breaks the run on both sides", () => {
  assert.equal(startsGroup(at("nina", 10), at("dom", 11)), true);
  assert.equal(endsGroup(at("nina", 10), at("dom", 11)), true);
});

test("the same sender, a minute apart, is one run", () => {
  assert.equal(startsGroup(at("nina", 10), at("nina", 11)), false);
  assert.equal(endsGroup(at("nina", 10), at("nina", 11)), false);
});

// The rule that stops one name sitting over a conversation that paused
// overnight.
test("the same sender after a long gap is a new run", () => {
  assert.equal(startsGroup(at("nina", 10), at("nina", 30)), true);
  assert.equal(endsGroup(at("nina", 10), at("nina", 30)), true);
});

test("five minutes exactly is a new run; just under it isn't", () => {
  const base = { member_id: "nina", created_at: "2026-09-28T10:00:00Z" };
  assert.equal(startsGroup(base, { member_id: "nina", created_at: "2026-09-28T10:05:00Z" }), true);
  assert.equal(startsGroup(base, { member_id: "nina", created_at: "2026-09-28T10:04:59Z" }), false);
});

test("an unreadable timestamp breaks the run rather than grouping blindly", () => {
  assert.equal(startsGroup({ member_id: "nina", created_at: "nonsense" }, at("nina", 10)), true);
});
