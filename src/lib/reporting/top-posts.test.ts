import test from "node:test";
import assert from "node:assert/strict";

import { isSafeUrl, postTypeFrom, rankBy, topThree } from "./top-posts.ts";

/**
 * Relative imports, because `node --test "src/**\/*.test.ts"` cannot
 * resolve the `@/` alias — the same rule every other unit test here
 * follows.
 */

test("a post is ranked by reach", () => {
  const posts = [
    { url: "a", reach: 3000, views: 90000 },
    { url: "b", reach: 12000, views: 1000 },
    { url: "c", reach: 8000, views: 200 },
  ];
  assert.deepEqual(
    topThree(posts).map((p) => p.url),
    ["b", "c", "a"],
    "not by views, or a 90,000-view post with 3,000 reach would lead",
  );
});

test("and by views when there is no reach, because TikTok reports one and Instagram the other", () => {
  assert.equal(rankBy({ reach: null, views: 4200 }), 4200);
  assert.equal(rankBy({ reach: 900, views: 4200 }), 900, "reach wins when both are there");
  assert.equal(rankBy({ reach: null, views: null }), null);
});

test("a post with no figures at all is left out, not ranked last", () => {
  // It is not a post that did badly; it is a post nobody has figures
  // for, and showing it third would be a claim about it.
  const posts = [
    { url: "a", reach: 100, views: null },
    { url: "b", reach: null, views: null },
    { url: "c", reach: 50, views: null },
  ];
  assert.deepEqual(
    topThree(posts).map((p) => p.url),
    ["a", "c"],
  );
});

test("three is the most, however many are offered", () => {
  const posts = Array.from({ length: 40 }, (_, i) => ({ url: `p${i}`, reach: i, views: null }));
  const top = topThree(posts);
  assert.equal(top.length, 3);
  assert.deepEqual(
    top.map((p) => p.url),
    ["p39", "p38", "p37"],
  );
});

test("a tie keeps the order it arrived in", () => {
  const posts = [
    { url: "first", reach: 500, views: null },
    { url: "second", reach: 500, views: null },
  ];
  assert.deepEqual(
    topThree(posts).map((p) => p.url),
    ["first", "second"],
  );
});

test("only http links are links", () => {
  assert.ok(isSafeUrl("https://www.instagram.com/p/abc/"));
  assert.ok(isSafeUrl("http://example.test/x"));
  // The one string that turns a client's report into somewhere to run
  // code. The database refuses it too, as a column constraint.
  assert.ok(!isSafeUrl("javascript:alert(1)"));
  assert.ok(!isSafeUrl("data:text/html,<script>"));
  assert.ok(!isSafeUrl("/relative/path"));
  assert.ok(!isSafeUrl("instagram.com/p/abc"));
  assert.ok(!isSafeUrl(""));
  assert.ok(!isSafeUrl("https://has a space/x"));
});

test("Meta's post type is mapped onto the six we store", () => {
  assert.equal(postTypeFrom("Reel"), "reel");
  assert.equal(postTypeFrom("IG reel"), "reel");
  assert.equal(postTypeFrom("Carousel"), "carousel");
  assert.equal(postTypeFrom("Album"), "carousel");
  assert.equal(postTypeFrom("Photo"), "photo");
  assert.equal(postTypeFrom("Story"), "story");
  assert.equal(postTypeFrom("Video"), "video");
  assert.equal(postTypeFrom("Something new Meta invented"), "other");
  assert.equal(postTypeFrom(""), null, "blank is not 'other' — nobody said");
  assert.equal(postTypeFrom(undefined), null);
});
