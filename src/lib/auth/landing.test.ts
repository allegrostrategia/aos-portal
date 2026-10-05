import assert from "node:assert/strict";
import { test } from "node:test";

import { landingPath, safeNextPath, usableNextPath } from "./landing.ts";

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

test("a reporting client who has just set a password goes to their report", () => {
  // The 2 October walkthrough bug: setPassword redirected to /piazza, so a
  // retainer client's very FIRST sign-in — straight after choosing their
  // password — landed on "Your account isn't ready yet". Every invited
  // client would have seen it.
  assert.equal(at({ hasReportAccess: true, memberStatus: null }), "/reporting");
});

test('"/" is the default everywhere, so one place decides', () => {
  // Three separate places used to default to /piazza: the sign-in action,
  // the confirm route and the login page. Each was a chance to send a
  // reporting client somewhere that bounces them.
  assert.equal(safeNextPath(undefined), "/");
  assert.equal(safeNextPath(null), "/");
});

test("a prefix is not an area: /reportingfoo is not /reporting", () => {
  // The cheap check is startsWith("/reporting"), and it would hand a
  // reporting client any path somebody added with that prefix.
  assert.equal(usableNextPath("/reportingfoo", "/reporting"), "/");
  assert.equal(usableNextPath("/reporting", "/reporting"), "/reporting");
  assert.equal(usableNextPath("/reporting/offers", "/reporting"), "/reporting/offers");
});

test("setting a password is reachable before anyone has a door", () => {
  // An invited account has no members row and no grant yet, so its landing
  // is /no-access — and /set-password is exactly what it is there to do.
  assert.equal(usableNextPath("/set-password", "/no-access"), "/set-password");
});

test("a login page is never a destination to aim at", () => {
  assert.equal(usableNextPath("/login", "/piazza"), "/");
  assert.equal(usableNextPath("/forgot-password", "/piazza"), "/");
});
