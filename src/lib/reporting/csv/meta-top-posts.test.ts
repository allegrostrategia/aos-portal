import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readMetaTopPosts } from "./meta-top-posts.ts";

const here = new URL("./fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, here), "utf8");

const SEP = "2026-09-01";

test("the three best posts of the month come out of the content export", () => {
  const posts = readMetaTopPosts(fixture("meta-content.csv"), SEP);

  assert.deepEqual(
    posts.map((p) => [p.rank, p.url, p.reach]),
    [
      [1, "https://x/1", 3000],
      [2, "https://x/2", 2500],
      [3, "https://x/3", 1500],
    ],
    "ranked by reach, and numbered in that order",
  );
});

test("a post outside the month is not in the list, however well it did", () => {
  // The fixture's August and October rows both reach 9,999 — far more
  // than anything in September. A month's top posts are the month's.
  const posts = readMetaTopPosts(fixture("meta-content.csv"), SEP);
  assert.ok(!posts.some((p) => p.url === "https://x/4"), "August's");
  assert.ok(!posts.some((p) => p.url === "https://x/5"), "October's");
});

test("each post carries its date, its kind and its figures — and no caption", () => {
  const [first] = readMetaTopPosts(fixture("meta-content.csv"), SEP);

  assert.equal(first.postedOn, "2026-09-02");
  assert.equal(first.postType, "reel");
  assert.equal(first.views, 4000);
  assert.equal(first.likesPlusComments, 230, "200 likes and 30 comments, as one figure");
  assert.equal(first.saves, 40);
  assert.equal(first.shares, 20);

  // **The whole row, checked for what is NOT in it** (Nina, 11
  // November). The Description column is right there in the file and
  // §10.1 says captions are never stored. A test that only checked the
  // figures would pass just as happily with the caption kept.
  const text = JSON.stringify(first);
  assert.ok(!text.includes("A post, with a comma"), "no caption, in any field");
  assert.deepEqual(Object.keys(first).sort(), [
    "likesPlusComments",
    "postType",
    "postedOn",
    "rank",
    "reach",
    "saves",
    "shares",
    "url",
    "views",
  ]);
});

test("the Ads export is not a content export, and yields nothing", () => {
  // Two clicks apart in Meta, and the obvious mistake is bringing the
  // right file to the wrong card. No permalink column, no posts.
  assert.deepEqual(readMetaTopPosts(fixture("meta-ads.csv"), SEP), []);
});

test("a row with no usable link is not a top post", () => {
  const text = [
    "Post ID,Description,Publish time,Permalink,Post type,Views,Reach,Likes,Shares,Comments,Saves",
    "1,x,09/02/2026 08:00:00,javascript:alert(1),Reel,100,9000,1,1,1,1",
    "2,x,09/03/2026 08:00:00,,Reel,100,8000,1,1,1,1",
    "3,x,09/04/2026 08:00:00,https://x/ok,Reel,100,10,1,1,1,1",
  ].join("\n");

  assert.deepEqual(
    readMetaTopPosts(text, SEP).map((p) => p.url),
    ["https://x/ok"],
    "the two that reached most have nothing to click",
  );
});

test("likes and comments are null only when neither is there", () => {
  const text = [
    "Post ID,Publish time,Permalink,Post type,Views,Reach,Likes,Comments",
    "1,09/02/2026 08:00:00,https://x/1,Reel,100,900,200,",
    "2,09/03/2026 08:00:00,https://x/2,Reel,100,800,,",
  ].join("\n");

  const [withLikes, withNeither] = readMetaTopPosts(text, SEP);
  assert.equal(withLikes.likesPlusComments, 200, "a missing comments column is not 200 + 0 lost");
  assert.equal(withNeither.likesPlusComments, null, "and nothing at all is a dash, not zero");
});
