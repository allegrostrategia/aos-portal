import assert from "node:assert/strict";
import { test } from "node:test";

import { validateReportClient } from "./report-client-input.ts";

const base = {
  email: "  Bella@Example.com ",
  displayName: "Bella Rossi",
  businessName: "Bella Rossi Coaching",
  kind: "retainer",
  firstMonth: "2026-01",
  accessEnd: "",
};

const plan = (input: Parameters<typeof validateReportClient>[0]) => {
  const result = validateReportClient(input);
  assert.ok("plan" in result, `expected a plan, got ${JSON.stringify(result)}`);
  return result.plan;
};

const error = (input: Parameters<typeof validateReportClient>[0]) => {
  const result = validateReportClient(input);
  assert.ok("error" in result, "expected an error, got a plan");
  return result.error;
};

test("a retainer client is accepted, tidied up", () => {
  const p = plan(base);
  assert.equal(p.email, "bella@example.com", "trimmed and lowercased");
  assert.equal(p.firstMonth, "2026-01-01", "stored as the first of the month");
  assert.equal(p.accessEndDate, null);
  assert.equal(p.currency, "GBP");
});

test("a retainer with a stray end date is accepted, and the date dropped", () => {
  // The bug Dom hit on 30 September: the form showed a Chiarezza-only field
  // on a retainer form, and the action then refused the whole submission
  // because it had something in it — leaving him on a screen he could not
  // get past. A date that does not apply is now ignored, not fatal.
  const p = plan({ ...base, accessEnd: "2026-12" });
  assert.equal(p.kind, "retainer");
  assert.equal(p.accessEndDate, null);
});

test("a Chiarezza attendee needs an end date", () => {
  assert.match(
    error({ ...base, kind: "chiarezza" }),
    /needs the month their access ends/,
  );
});

test("a Chiarezza attendee with one is accepted", () => {
  const p = plan({ ...base, kind: "chiarezza", accessEnd: "2026-12" });
  assert.equal(p.kind, "chiarezza");
  assert.equal(p.accessEndDate, "2026-12-01");
});

test("access cannot end before the client's first month", () => {
  assert.match(
    error({ ...base, kind: "chiarezza", firstMonth: "2026-06", accessEnd: "2026-01" }),
    /cannot end before/,
  );
});

test("an aOS member is sent somewhere else, not half created", () => {
  assert.match(error({ ...base, kind: "aos_member" }), /already has a login/);
});

test("the three required words are required", () => {
  for (const missing of ["email", "displayName", "businessName"] as const) {
    assert.match(error({ ...base, [missing]: "   " }), /all needed/);
  }
});

test("a month that is not a month is refused", () => {
  assert.match(error({ ...base, firstMonth: "January" }), /as YYYY-MM/);
  assert.match(error({ ...base, firstMonth: "2026-13" }), /as YYYY-MM/);
  assert.match(error({ ...base, firstMonth: "" }), /as YYYY-MM/);
});

test("an unknown kind is refused rather than guessed at", () => {
  assert.match(error({ ...base, kind: "" }), /retainer client or a Chiarezza/);
  assert.match(error({ ...base, kind: "admin" }), /retainer client or a Chiarezza/);
});
