import assert from "node:assert/strict";
import { test } from "node:test";

import { landingPath, safeNextPath } from "./landing.ts";

const at = (over: Partial<Parameters<typeof landingPath>[0]> = {}) =>
  landingPath({ memberStatus: null, hasReportAccess: false, signedIn: true, ...over });

test("a member goes to the portal", () => {
  assert.equal(at({ memberStatus: "active" }), "/piazza");
  assert.equal(at({ memberStatus: "onboarding" }), "/piazza");
});

test("a member who also has reporting still goes to the portal", () => {
  // For them reporting is one more area of the membership, reached from
  // inside it — not a separate front door.
  assert.equal(at({ memberStatus: "active", hasReportAccess: true }), "/piazza");
});

test("a reporting login with no members row goes to the report", () => {
  // The bug this file exists for: this returned /piazza, which bounced to
  // /no-access, so a retainer client's first sign-in said their account
  // wasn't ready.
  assert.equal(at({ hasReportAccess: true }), "/reporting");
  assert.notEqual(at({ hasReportAccess: true }), "/piazza");
});

test("a cancelled member loses the portal but keeps nothing else", () => {
  assert.equal(at({ memberStatus: "cancelled" }), "/no-access");
});

test("a cancelled member who is also a reporting client still has that", () => {
  // Their aOS membership ended; a separate retainer arrangement has not.
  assert.equal(at({ memberStatus: "cancelled", hasReportAccess: true }), "/reporting");
});

test("an account with neither is told so", () => {
  assert.equal(at(), "/no-access");
});

test("no session means the login screen", () => {
  assert.equal(at({ signedIn: false }), "/login");
  assert.equal(at({ signedIn: false, memberStatus: "active" }), "/login");
});

test("a post-login path is honoured when it is internal", () => {
  assert.equal(safeNextPath("/reporting/enter/email"), "/reporting/enter/email");
  assert.equal(safeNextPath("/piazza"), "/piazza");
});

test("anything that leaves the site falls back to the decider", () => {
  // "/" rather than a real screen: only the root page knows which door this
  // person has, so guessing here is how the bug above came back.
  for (const bad of [
    "https://evil.example", "//evil.example", "/\\evil.example",
    "", "   ", "piazza", null, undefined, 42,
  ]) {
    assert.equal(safeNextPath(bad), "/", String(bad));
  }
});

test("a control character cannot smuggle a scheme through", () => {
  assert.equal(safeNextPath("/piazza\nhttps://evil.example"), "/");
});
