import assert from "node:assert/strict";
import { test } from "node:test";

import { isInternalReportPath } from "./paths.ts";

test("a real next-section path is allowed", () => {
  assert.equal(isInternalReportPath("/reporting/enter/email"), true);
  assert.equal(isInternalReportPath("/reporting/enter/email?month=2026-08"), true);
});

test("anywhere outside the reporting tool is refused", () => {
  assert.equal(isInternalReportPath("/piazza"), false);
  assert.equal(isInternalReportPath("/admin/members"), false);
  assert.equal(isInternalReportPath(""), false);
});

test("an absolute URL is refused", () => {
  assert.equal(isInternalReportPath("https://evil.example/reporting"), false);
});

test("a protocol-relative URL is refused", () => {
  // The one that gets past a startsWith("/") check: the browser reads
  // //evil.example as a full URL and leaves the site.
  assert.equal(isInternalReportPath("//evil.example"), false);
  assert.equal(isInternalReportPath("//evil.example/reporting"), false);
});

test("the backslash form is refused too", () => {
  assert.equal(isInternalReportPath("/\\evil.example"), false);
});

test("a control character cannot smuggle a scheme through", () => {
  assert.equal(isInternalReportPath("/reporting\n/../../piazza\rhttps://x"), false);
  assert.equal(isInternalReportPath("/reporting\u0000"), false);
});

test("a path that merely starts with the right letters is still inside", () => {
  // Honest about what this does NOT do: it is a prefix check, so a route
  // like /reportingsomething would pass. Nothing serves that path, and the
  // check exists to keep the redirect on this origin rather than to police
  // the route table.
  assert.equal(isInternalReportPath("/reportingsomething"), true);
});
