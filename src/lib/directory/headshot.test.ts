import assert from "node:assert/strict";
import { test } from "node:test";

import { extensionOf, headshotPathFor, isHeadshotFile, ownsHeadshotPath } from "./headshot.ts";

test("the common photo formats are accepted", () => {
  for (const name of ["me.jpg", "me.JPEG", "me.png", "me.webp"]) {
    assert.equal(isHeadshotFile(name), true, name);
  }
});

// What an iPhone produces by default. Rejecting it means the member whose only
// photo is a HEIC quietly skips the step.
test("HEIC is accepted, because that's what phones produce", () => {
  assert.equal(isHeadshotFile("IMG_4021.HEIC"), true);
  assert.equal(isHeadshotFile("IMG_4021.heif"), true);
});

test("a document isn't a headshot", () => {
  for (const name of ["cv.pdf", "notes.txt", "video.mp4", "noextension"]) {
    assert.equal(isHeadshotFile(name), false, name);
  }
});

test("the path starts with the member's own id — what the policy checks", () => {
  const path = headshotPathFor("member-1", "me.jpg", "abc123");
  assert.equal(path, "member-1/abc123.jpg");
  assert.equal(ownsHeadshotPath("member-1", path), true);
});

test("a path in somebody else's folder is not theirs", () => {
  assert.equal(ownsHeadshotPath("member-1", "member-2/abc.jpg"), false);
  // The prefix check must not be fooled by a longer id starting the same way.
  assert.equal(ownsHeadshotPath("member-1", "member-10/abc.jpg"), false);
});

test("a file with no extension still lands somewhere sensible", () => {
  assert.equal(headshotPathFor("m", "photo", "x"), "m/x.jpg");
  assert.equal(extensionOf("photo"), "");
});
