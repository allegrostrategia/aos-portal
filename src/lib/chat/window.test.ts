import assert from "node:assert/strict";
import { test } from "node:test";

import { isOpen, windowState } from "./window.ts";

// Weekly Check-Ins as seeded: Monday, 14:00 to 15:30 UK.
const CHECK_INS = { window_weekday: 1, window_start: "14:00:00", window_end: "15:30:00" };
const GENERAL = { window_weekday: null, window_start: null, window_end: null };

// 2026-09-14 is a Monday in British Summer Time: 14:00 UK is 13:00Z.
const at = (iso: string) => new Date(iso);

test("a channel with no window is always open", () => {
  assert.deepEqual(windowState(GENERAL, at("2026-09-15T03:00:00Z")), { kind: "always" });
});

test("open at 14:00 UK on a Monday, and until 15:30 exclusive", () => {
  assert.equal(isOpen(CHECK_INS, at("2026-09-14T13:00:00Z")), true);
  assert.equal(isOpen(CHECK_INS, at("2026-09-14T14:29:59Z")), true);
  assert.equal(isOpen(CHECK_INS, at("2026-09-14T14:30:00Z")), false);
  assert.equal(isOpen(CHECK_INS, at("2026-09-14T12:59:59Z")), false);
});

test("before the window on the Monday, it opens later that day", () => {
  const s = windowState(CHECK_INS, at("2026-09-14T08:00:00Z"));
  assert.equal(s.kind, "closed");
  if (s.kind === "closed") assert.equal(s.opensAt.toISOString(), "2026-09-14T13:00:00.000Z");
});

test("after the window on the Monday, it opens next Monday", () => {
  const s = windowState(CHECK_INS, at("2026-09-14T16:00:00Z"));
  assert.equal(s.kind, "closed");
  if (s.kind === "closed") assert.equal(s.opensAt.toISOString(), "2026-09-21T13:00:00.000Z");
});

test("midweek, it opens the coming Monday", () => {
  const s = windowState(CHECK_INS, at("2026-09-17T10:00:00Z"));
  assert.equal(s.kind, "closed");
  if (s.kind === "closed") assert.equal(s.opensAt.toISOString(), "2026-09-21T13:00:00.000Z");
});

test("a Sunday night in UK time is still 'tomorrow', not 'in eight days'", () => {
  // 23:30 UK on Sunday 20 Sep is 22:30Z. UTC agrees it's Sunday; the point is
  // the wall clock, tested where UTC and UK differ: Sunday 23:30 UK in GMT+1.
  const s = windowState(CHECK_INS, at("2026-09-20T22:30:00Z"));
  if (s.kind === "closed") assert.equal(s.opensAt.toISOString(), "2026-09-21T13:00:00.000Z");
  // And at 23:30Z, which is 00:30 UK Monday: still the coming Monday, in hours.
  const t = windowState(CHECK_INS, at("2026-09-20T23:30:00Z"));
  if (t.kind === "closed") assert.equal(t.opensAt.toISOString(), "2026-09-21T13:00:00.000Z");
});

test("the window follows the clock change: 14:00 UK in November is 14:00Z", () => {
  // 2026-11-02 is a Monday, GMT.
  assert.equal(isOpen(CHECK_INS, at("2026-11-02T13:30:00Z")), false);
  assert.equal(isOpen(CHECK_INS, at("2026-11-02T14:00:00Z")), true);
  const s = windowState(CHECK_INS, at("2026-10-29T09:00:00Z"));
  if (s.kind === "closed") assert.equal(s.opensAt.toISOString(), "2026-11-02T14:00:00.000Z");
});

test("while open, it says when it closes", () => {
  const s = windowState(CHECK_INS, at("2026-09-14T13:10:00Z"));
  assert.equal(s.kind, "open");
  if (s.kind === "open") assert.equal(s.closesAt.toISOString(), "2026-09-14T14:30:00.000Z");
});
