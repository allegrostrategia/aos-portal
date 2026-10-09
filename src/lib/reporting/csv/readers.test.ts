import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { readMetaAds } from "./meta-ads.ts";
import { readMetaContent } from "./meta-content.ts";
import { cellNumber, readTable, tokenise } from "./tokenise.ts";

/**
 * §10.1 and §10.2, against fixtures shaped like the real exports.
 *
 * The ads fixture reproduces the brief's own worked check — spend
 * £600.00, impressions 60,000, link clicks 4,200, leads 100 (60 lead
 * form + 40 opt-in) — so these assertions are the brief's, not mine.
 */

const here = new URL("./fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, here), "utf8");

const SEPTEMBER = "2026-09-01";

test("a quoted comma does not shift the row", () => {
  // The failure this prevents is silent: every column after the quoted
  // one moves left, and the figures are all somebody else's.
  const rows = tokenise('a,b,c\n"one, two",three,four\n');
  assert.deepEqual(rows[1], ["one, two", "three", "four"]);
});

test("a doubled quote is one quote, and CRLF is a line break", () => {
  const rows = tokenise('a,b\r\n"she said ""hello""",2\r\n');
  assert.deepEqual(rows[1], ['she said "hello"', "2"]);
});

test("a byte-order mark does not become part of the first header", () => {
  // Excel adds one on save, and without this the first column is called
  // "﻿Campaign name" and matches nothing.
  //
  // Asserted on `tokenise` as well as `readTable`, because `readTable`
  // trims and `String.trim()` happens to strip a BOM — so going through
  // it alone passes with the guard taken out, and the next person to
  // read the raw rows gets the mark back.
  assert.equal(
    tokenise("﻿Campaign name,Impressions\nx,1\n")[0][0],
    "Campaign name",
  );
  const { headers } = readTable("﻿Campaign name,Impressions\nx,1\n");
  assert.equal(headers[0], "Campaign name");
});

test("a line break inside a quoted field is refused, not half-read", () => {
  assert.throws(() => tokenise('a,b\n"one\ntwo",3\n'), /line break inside a quoted field/);
});

test("an empty cell is nothing, not zero", () => {
  // §4's rule: a column that is not there and a column that says 0 are
  // different facts, and only one should draw a bar.
  assert.equal(cellNumber(""), null);
  assert.equal(cellNumber("-"), null);
  assert.equal(cellNumber(undefined), null);
  assert.equal(cellNumber("0"), 0);
  assert.equal(cellNumber("1,234"), 1234);
  assert.equal(cellNumber("£600.00"), 600);
  assert.equal(cellNumber("not a number"), null);
});

test("the content export fills Social Media from the month's posts only", () => {
  const result = readMetaContent(fixture("meta-content.csv"), SEPTEMBER);

  assert.equal(result.problem, undefined);
  assert.equal(result.rowsUsed, 3, "three posts in September");
  assert.equal(result.rowsOutsideMonth, 2, "August and October are counted, not used");

  assert.deepEqual(result.figures, {
    social_media_posts_published: 3,
    social_media_views: 9000,
    social_media_likes_plus_comments: 510,
    social_media_shares: 35,
    social_media_saves: 80,
    social_media_follows_gained: 10,
  });
});

test("the content export never fills reach, and says why", () => {
  // Summed post reach is not account reach in either direction: it
  // double counts people who saw several posts and misses stories. In
  // the brief's sample, posts summed to 18,000 against 30,000.
  const result = readMetaContent(fixture("meta-content.csv"), SEPTEMBER);
  assert.ok(!("social_media_reach" in result.figures), "reach is not filled");
  assert.ok(
    result.cannotFill.some((line) => /reach/i.test(line) && /summed/i.test(line)),
    "and the card says why rather than leaving a blank box unexplained",
  );
  assert.ok(result.cannotFill.some((line) => /trial reels/i.test(line)));
});

test("the ads export never fills reach either", () => {
  // Campaigns overlap the same way posts do: one person reached by
  // three campaigns is one person, and summing says three.
  const result = readMetaAds(fixture("meta-ads.csv"));
  assert.ok(!("ads_reach" in result.figures), "reach is not filled");
  assert.ok(result.cannotFill.some((line) => /reach/i.test(line) && /overlap/i.test(line)));
});

test("the ads export matches the brief's own worked check", () => {
  const result = readMetaAds(fixture("meta-ads.csv"), { "autumn workshop opt in": "leads" });

  assert.equal(result.problem, undefined);
  assert.equal(result.figures.ads_spend, 600);
  assert.equal(result.figures.ads_impressions, 60000);
  assert.equal(result.figures.ads_link_clicks, 4200);
  assert.equal(result.figures.ads_leads, 100, "60 from the lead form, 40 from the opt-in");
});

test("campaigns that spent nothing are skipped", () => {
  // Four of the nine rows are inactive zeros. They change no total, but
  // counting them would make "nine campaigns" a lie.
  const result = readMetaAds(fixture("meta-ads.csv"));
  assert.equal(result.rowsUsed, 5);
  assert.equal(result.rowsOutsideMonth, 4);
});

test("cost per lead uses the lead campaigns' spend, not all of it", () => {
  // £150 went on two profile-visit campaigns that were never meant to
  // get leads. Blended, cost per lead is £6.00; over the three lead
  // campaigns it is £4.50.
  const result = readMetaAds(fixture("meta-ads.csv"), { "autumn workshop opt in": "leads" });
  assert.equal(result.leadCampaignSpend, 450);
  assert.equal(result.figures.ads_spend, 600, "and total spend is still total spend");
});

test("the Results column is never summed", () => {
  // It means something different in every row: profile visits in one, a
  // custom opt-in in another, lead-form leads in a third. 700 is what
  // summing it would give.
  const result = readMetaAds(fixture("meta-ads.csv"), { "autumn workshop opt in": "leads" });
  assert.notEqual(result.figures.ads_leads, 700);
  assert.ok(!Object.values(result.figures).includes(700));
});

test("an unmapped conversion column is handed back to be ticked, not guessed", () => {
  const result = readMetaAds(fixture("meta-ads.csv"));
  assert.deepEqual(
    result.unknownConversions.map((c) => c.column),
    ["autumn workshop opt in"],
  );
  assert.equal(result.unknownConversions[0].total, 40, "with what it comes to, for context");
  assert.equal(result.figures.ads_leads, 60, "and it is not counted until they say so");
});

test("a column mapped as ignored stays out and stops being asked about", () => {
  const result = readMetaAds(fixture("meta-ads.csv"), { "autumn workshop opt in": "ignored" });
  assert.equal(result.unknownConversions.length, 0);
  assert.equal(result.figures.ads_leads, 60);
});

test("the spend column is found whatever currency it is in", () => {
  const usd = fixture("meta-ads.csv").replace("Amount spent (GBP)", "Amount spent (USD)");
  assert.equal(readMetaAds(usd).figures.ads_spend, 600);
});

test("a file from the wrong place is refused, in words", () => {
  assert.match(
    readMetaContent("Campaign name,Amount spent (GBP)\nx,1\n", SEPTEMBER).problem ?? "",
    /does not look like a Meta content export/i,
  );
  assert.match(
    readMetaAds("Post ID,Views\n1,100\n").problem ?? "",
    /does not look like a Meta Ads export/i,
  );
});

test("an empty file is refused rather than filling everything with zero", () => {
  for (const result of [readMetaContent("", SEPTEMBER), readMetaAds("")]) {
    assert.match(result.problem ?? "", /no rows/i);
    assert.deepEqual(result.figures, {});
  }
  // A header row and nothing under it is the same thing.
  assert.match(
    readMetaContent("Publish time,Views\n", SEPTEMBER).problem ?? "",
    /no rows/i,
  );
});

test("a month with no posts in it fills zeros, which is a real answer", () => {
  // Different from an empty file: they did post, just not that month —
  // so "0 posts published" is true and worth saving.
  const result = readMetaContent(fixture("meta-content.csv"), "2026-07-01");
  assert.equal(result.problem, undefined);
  assert.equal(result.figures.social_media_posts_published, 0);
  assert.equal(result.rowsOutsideMonth, 5);
});

test("reading the same file twice gives the same figures", () => {
  // Re-uploading replaces and never doubles. The parser is where that
  // is decided: it computes from the file alone and never reads what is
  // already in the box.
  const once = readMetaAds(fixture("meta-ads.csv"));
  const twice = readMetaAds(fixture("meta-ads.csv"));
  assert.deepEqual(once.figures, twice.figures);
});
