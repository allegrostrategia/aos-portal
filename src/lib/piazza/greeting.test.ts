import assert from "node:assert/strict";
import { test } from "node:test";

import { greeting } from "./greeting.ts";

// 14 Sep 2026 is in British Summer Time: UK = UTC+1.
test("the greeting follows the UK clock through the day", () => {
  assert.equal(greeting(new Date("2026-09-14T04:30:00Z")), "Buongiorno"); // 05:30 UK
  assert.equal(greeting(new Date("2026-09-14T10:59:00Z")), "Buongiorno"); // 11:59 UK
  assert.equal(greeting(new Date("2026-09-14T11:00:00Z")), "Buon pomeriggio"); // 12:00 UK
  assert.equal(greeting(new Date("2026-09-14T16:59:00Z")), "Buon pomeriggio"); // 17:59 UK
  assert.equal(greeting(new Date("2026-09-14T17:00:00Z")), "Buonasera"); // 18:00 UK
  assert.equal(greeting(new Date("2026-09-14T20:59:00Z")), "Buonasera"); // 21:59 UK
  assert.equal(greeting(new Date("2026-09-14T21:00:00Z")), "Buonanotte"); // 22:00 UK
  assert.equal(greeting(new Date("2026-09-15T03:59:00Z")), "Buonanotte"); // 04:59 UK
});

test("it is the UK hour, not the server's: 23:30Z in winter is buonanotte, in summer 00:30 UK is too", () => {
  assert.equal(greeting(new Date("2026-12-01T23:30:00Z")), "Buonanotte");
  assert.equal(greeting(new Date("2026-12-01T09:00:00Z")), "Buongiorno");
});
