import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GENERAL_POST_TYPES,
  POST_TYPE_LABELS,
  POST_TYPE_SETS,
  postTypeLabel,
  postFigureLabel,
  postFiguresFor,
  postTypeSetFor,
  postTypesFor,
} from "./platform-post-types.ts";
import { POST_TYPES, postTypeFrom, type PostType } from "./top-posts.ts";

test("each platform offers its own kinds of post, in Nina's order", () => {
  assert.deepEqual(POST_TYPE_SETS.instagram.types, ["reel", "carousel", "photo", "story", "other"]);
  assert.deepEqual(POST_TYPE_SETS.tiktok.types, ["video", "carousel", "live", "other"]);
  assert.deepEqual(POST_TYPE_SETS.youtube.types, ["video", "reel", "live", "other"]);
  // The one the whole item is named after.
  assert.ok(!POST_TYPE_SETS.linkedin.types.includes("reel"), "a LinkedIn post cannot be a Reel");
  assert.ok(!POST_TYPE_SETS.linkedin.types.includes("story"));
  assert.ok(!POST_TYPE_SETS.facebook.types.includes("story"));
  assert.ok(!POST_TYPE_SETS.tiktok.types.includes("photo"), "TikTok has no single photo");
});

test("the same shape of post is the same value, under each platform's word", () => {
  // A LinkedIn Image and an Instagram Photo are one photograph.
  assert.equal(postTypeLabel("photo", "linkedin"), "Image");
  assert.equal(postTypeLabel("photo", "instagram"), "Photo");
  assert.equal(postTypeLabel("photo", "facebook"), "Photo");
  // A stack of pages, three ways.
  assert.equal(postTypeLabel("carousel", "linkedin"), "Document / carousel");
  assert.equal(postTypeLabel("carousel", "tiktok"), "Photo carousel");
  assert.equal(postTypeLabel("carousel", "instagram"), "Carousel");
  // A vertical short video, two ways — and TikTok's is just its Video.
  assert.equal(postTypeLabel("reel", "youtube"), "Short");
  assert.equal(postTypeLabel("reel", "instagram"), "Reel");
  assert.equal(postTypeLabel("video", "youtube"), "Long-form");
  assert.equal(postTypeLabel("video", "tiktok"), "Video");
  // And the plain word where a platform has nothing of its own to say.
  assert.equal(postTypeLabel("video", null), "Video");
  assert.equal(postTypeLabel("other", "linkedin"), "Post");
});

test("a kind corrected never retypes a post", () => {
  // The client who chose "Other", put their Reels in, then said
  // Instagram. A <select> whose value has no option renders as the
  // first one, so the Reel would have become a Photo on the next save.
  assert.ok(!GENERAL_POST_TYPES.types.includes("reel"));
  assert.ok(postTypesFor("other", (t) => t === "reel").includes("reel"));
  // It sorts after the set, because it is not one this platform offers.
  assert.equal(postTypesFor("other", (t) => t === "reel").at(-1), "reel");
  // A story on a platform that has no stories is kept the same way.
  assert.ok(postTypesFor("linkedin", (t) => t === "story").includes("story"));
  // And nothing is added for a type nobody is holding.
  assert.deepEqual(postTypesFor("instagram"), POST_TYPE_SETS.instagram.types);
});

test("a platform with no kind yet gets the general set", () => {
  assert.equal(postTypeSetFor(null), GENERAL_POST_TYPES);
  assert.equal(postTypeSetFor("other"), GENERAL_POST_TYPES);
  // No Story and no Reel: one company's word for one company's format,
  // on a platform we know nothing about.
  assert.ok(!GENERAL_POST_TYPES.types.includes("story"));
  assert.ok(GENERAL_POST_TYPES.types.includes("photo"), "a Pin is a photo");
  assert.ok(GENERAL_POST_TYPES.types.includes("text"), "a Thread is text");
});

test("every type a set names is a type that exists, and every type is named", () => {
  const named = new Set<PostType>([
    ...GENERAL_POST_TYPES.types,
    ...Object.values(POST_TYPE_SETS).flatMap((set) => set.types),
  ]);
  for (const type of named) {
    assert.ok(POST_TYPES.includes(type), `${type} is offered but is not a stored type`);
  }
  for (const type of POST_TYPES) {
    assert.ok(POST_TYPE_LABELS[type], `${type} has no label`);
    assert.ok(named.has(type), `${type} is stored but no platform ever offers it`);
  }
});

test("every platform can say it does not know", () => {
  // The escape hatch, and what the Meta import falls back to rather
  // than guessing. Nina's five lists do not have it; a client who
  // cannot say what a post was should say that.
  for (const [kind, set] of Object.entries(POST_TYPE_SETS)) {
    assert.ok(set.types.includes("other"), `${kind} has no "Post"`);
  }
});

test("the Meta column is read most specific first", () => {
  // "Photo carousel" holds both words and is a carousel; "Live video"
  // holds both and is live. The order of the tests is the whole of it.
  assert.equal(postTypeFrom("Photo carousel"), "carousel");
  assert.equal(postTypeFrom("Live video"), "live");
  assert.equal(postTypeFrom("Reel"), "reel");
  assert.equal(postTypeFrom("Link"), "link");
  assert.equal(postTypeFrom("Status"), "text", "Facebook's word for a post with no picture");
  assert.equal(postTypeFrom("Text update"), "text");
  assert.equal(postTypeFrom("Poll"), "poll");
  assert.equal(postTypeFrom("Article"), "article");
  assert.equal(postTypeFrom("Something else"), "other", "it said something, just not one we know");
  assert.equal(postTypeFrom(""), null, "and nobody said anything at all");
});

test("a post's figures follow the platform, in its own words", () => {
  // The five columns are fixed; which of them a kind reports is not.
  assert.deepEqual(postFiguresFor("tiktok"), ["views", "likesPlusComments", "saves", "shares"]);
  assert.ok(!postFiguresFor("tiktok").includes("reach"), "TikTok reports no reach");
  assert.ok(!postFiguresFor("linkedin").includes("saves"), "nor LinkedIn a save");
  assert.ok(!postFiguresFor("youtube").includes("shares"));

  assert.equal(postFigureLabel("saves", "tiktok"), "Favourites");
  assert.equal(postFigureLabel("views", "tiktok"), "Video views");
  assert.equal(postFigureLabel("reach", "linkedin"), "Impressions");
  assert.equal(postFigureLabel("shares", "linkedin"), "Reposts");
  assert.equal(postFigureLabel("likesPlusComments", "youtube"), "Likes");
  assert.equal(postFigureLabel("reach", null), "Reach", "and the plain word otherwise");
});

test("a figure a post already holds is never dropped", () => {
  // Rule 7 on the one screen where the columns are fixed: a TikTok post
  // that carries a reach from before anybody said what kind it was
  // keeps showing it, labelled plainly.
  const none = { reach: null, views: 10, likesPlusComments: null, saves: null, shares: null };
  assert.ok(!postFiguresFor("tiktok", [none]).includes("reach"));
  const held = { ...none, reach: 4000 };
  assert.ok(postFiguresFor("tiktok", [held]).includes("reach"));
  assert.equal(postFiguresFor("tiktok", [held]).at(-1), "reach", "and it sorts after the set");
});
