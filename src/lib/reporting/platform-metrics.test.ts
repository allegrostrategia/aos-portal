import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GENERAL_SET,
  PLATFORM_SETS,
  platformAsks,
  platformCardLabel,
  platformLabel,
  platformMetrics,
  platformOrdered,
  platformSetFor,
} from "./platform-metrics.ts";
import { PLATFORM_KINDS, platformKindOf, type PlatformKind } from "./platforms.ts";
import type { ReportMetric } from "./queries.ts";

/**
 * A figure set per platform (§5.2, approved by Nina 16 November 2026).
 *
 * Two things can go wrong here and neither shows on a screen until a
 * client is looking at it: a set naming a figure the database does not
 * have, which is a box that can never be filled, and a figure no set
 * names, which is a column nobody can ever reach. Both are checked
 * against the seed below.
 */

/** Every social metric the migrations seed, with its label. */
const SEEDED: Map<string, { label: string; input: string; unit: string }> = (() => {
  const out = new Map<string, { label: string; input: string; unit: string }>();
  const sql = readFileSync("supabase/migrations/20260930123000_report_metrics_seed.sql", "utf8");
  const row =
    /\('(social_media_[a-z_]+)', 'social_media', '((?:[^']|'')*)', '(\w+)', '(\w+)'/g;
  for (const m of sql.matchAll(row)) {
    out.set(m[1], { label: m[2].replace(/''/g, "'"), input: m[3], unit: m[4] });
  }
  return out;
})();

const metric = (key: string): ReportMetric =>
  ({
    key,
    category: "social_media",
    label: SEEDED.get(key)?.label ?? key,
    input_type: SEEDED.get(key)?.input ?? "core",
    unit: SEEDED.get(key)?.unit ?? "count",
    good_direction: "up",
    entity_type: "social_platform",
    formula: null,
    sort_order: [...SEEDED.keys()].indexOf(key) + 1,
  }) as unknown as ReportMetric;

const all = () => [...SEEDED.keys()].map(metric);

test("the seeded social list was actually found", () => {
  // Guards every test below: an empty map would make them all vacuous.
  assert.ok(SEEDED.size >= 40, `only ${SEEDED.size} social metrics read from the seed`);
  assert.equal(SEEDED.get("social_media_saves")?.label, "Saves");
});

test("every figure a set asks for is a figure the database has", () => {
  for (const kind of PLATFORM_KINDS) {
    for (const key of PLATFORM_SETS[kind].keys) {
      assert.ok(SEEDED.has(key), `${kind} asks for "${key}", which is not a seeded metric`);
    }
  }
  for (const key of GENERAL_SET.keys) {
    assert.ok(SEEDED.has(key), `the general set asks for "${key}"`);
  }
});

test("every figure the database has is asked for by somebody", () => {
  // The other direction, and the one that rots quietly: a metric no set
  // names is a row in report_metrics that no screen will ever show, so
  // it can be entered by a CSV or a seed and then be invisible.
  const asked = new Set(PLATFORM_KINDS.flatMap((k) => [...PLATFORM_SETS[k].keys]));
  const orphaned = [...SEEDED.keys()].filter((key) => !asked.has(key));
  assert.deepEqual(orphaned, [], "social figures no platform is ever asked for");
});

test("every word a set overrides belongs to a figure that set holds", () => {
  for (const kind of PLATFORM_KINDS) {
    const set = PLATFORM_SETS[kind];
    for (const key of Object.keys(set.words ?? {})) {
      assert.ok(
        set.keys.includes(key),
        `${kind} renames "${key}" and never shows it — a label nobody reads`,
      );
    }
  }
});

test("Instagram's set is the set that existed the day before", () => {
  // Nina: "This is today's set. Nothing is lost." Every figure seeded
  // before 17 November belongs to Instagram, and in the same order.
  // The first 22 in the seed are the ones that existed before today:
  // the eighteen new ones were appended after them, which is how the
  // migration avoids renumbering anything.
  const before = [...SEEDED.keys()].slice(0, 22);
  assert.equal(before.length, 22);
  for (const key of before) {
    assert.ok(
      PLATFORM_SETS.instagram.keys.includes(key),
      `Instagram lost "${key}", which it was asked for yesterday`,
    );
  }
  assert.equal(PLATFORM_SETS.instagram.keys.length, 22, "and gained nothing");
});

test("LinkedIn has no saves and does have impressions", () => {
  assert.ok(!platformAsks("social_media_saves", "linkedin"));
  assert.ok(!platformAsks("social_media_save_rate", "linkedin"));
  assert.ok(platformAsks("social_media_impressions", "linkedin"));
  assert.ok(platformAsks("social_media_members_reached", "linkedin"));
  // And the figure Nina added on 16 November, optional.
  assert.ok(platformAsks("social_media_dms_from_content", "linkedin"));
});

test("no platform row at all is Instagram, not the general set", () => {
  // §5.2 is "Instagram first" and the first save creates the row, so a
  // client who has entered nothing is asked Instagram's questions. Read
  // as "no kind" instead, the boxes changed shape the moment they
  // pressed Save, and a Social Media report whose figures are stored at
  // month level lost two of its three charts.
  assert.equal(platformKindOf(null), "instagram");
  assert.equal(platformKindOf(undefined), "instagram");
  // While a platform that EXISTS and has not been given a kind is a
  // different thing: somebody has been asked and has not answered.
  assert.equal(platformKindOf({ platform_kind: null }), null);
  assert.equal(platformKindOf({ platform_kind: "linkedin" }), "linkedin");
});

test("a platform with no kind yet gets the general set", () => {
  assert.equal(platformSetFor(null), GENERAL_SET);
  assert.equal(platformSetFor("other"), GENERAL_SET);
  assert.ok(platformAsks("social_media_reach", null));
  // Lean on purpose: it serves a platform we know nothing about.
  assert.ok(!platformAsks("social_media_saves", null));
});

test("the words follow the platform", () => {
  const followers = metric("social_media_followers_at_month_end");
  assert.equal(platformLabel(followers, "youtube"), "Subscribers at month end");
  assert.equal(platformLabel(followers, "instagram"), "Followers at month end");
  assert.equal(platformLabel(followers, null), "Followers at month end");

  const visits = metric("social_media_profile_visits");
  assert.equal(platformLabel(visits, "facebook"), "Page visits");
  assert.equal(platformLabel(visits, "linkedin"), "Profile views");
  assert.equal(platformLabel(visits, "instagram"), "Profile visits");
});

test("the Overview card says Subscribers on a channel", () => {
  // The card has about 115px: the set's own label is a row label.
  assert.equal(
    platformCardLabel("social_media_followers_at_month_end", "youtube", "Followers"),
    "Subscribers",
  );
  assert.equal(
    platformCardLabel("social_media_followers_at_month_end", "linkedin", "Followers"),
    "Followers",
  );
  assert.equal(platformCardLabel("financials_total_revenue", "youtube", "Revenue"), "Revenue");
});

test("the entry screen shows the kind's figures, in the kind's order", () => {
  const shown = platformMetrics(all(), "youtube").map((m) => m.key);
  assert.deepEqual(shown, [...PLATFORM_SETS.youtube.keys]);
});

test("a figure the month already holds is never hidden", () => {
  // The rule that makes a kind safe to correct: "Other" put right as
  // LinkedIn must not strand the saves somebody entered last month.
  const held = (key: string) => key === "social_media_saves";
  const shown = platformMetrics(all(), "linkedin", held).map((m) => m.key);
  assert.ok(shown.includes("social_media_saves"));
  // After the set, because it is no longer a figure this platform is
  // being asked for.
  assert.equal(shown.at(-1), "social_media_saves");
  assert.deepEqual(shown.slice(0, -1), [...PLATFORM_SETS.linkedin.keys]);
});

test("the report filters nothing at all", () => {
  // A published month shows the figures it HOLDS, and the report pages
  // drop the nulls themselves. A filter here is the one thing that could
  // take a row off a report a client has already been sent.
  const shown = platformOrdered(all(), "youtube");
  assert.equal(shown.length, SEEDED.size);
  // Still in YouTube's order, with its words, and the rest behind.
  assert.deepEqual(
    shown.slice(0, PLATFORM_SETS.youtube.keys.length).map((m) => m.key),
    [...PLATFORM_SETS.youtube.keys],
  );
  assert.equal(shown[0].label, "Subscribers at month end");
});

test("a metric from another category is passed through untouched", () => {
  // Callers hand it a whole category list without knowing which one.
  const other = {
    ...metric("social_media_reach"),
    key: "financials_total_revenue",
    category: "financials",
    label: "Total revenue",
  } as ReportMetric;
  const shown = platformMetrics([other, metric("social_media_views")], "youtube");
  assert.deepEqual(shown.map((m) => m.key), ["financials_total_revenue", "social_media_views"]);
  assert.equal(shown[0].label, "Total revenue");

  // And it stays where it was: the social rows are reordered among
  // themselves, not sorted over the whole list.
  const mixed = platformMetrics(
    [metric("social_media_watch_time"), other, metric("social_media_views")],
    "youtube",
  );
  assert.deepEqual(mixed.map((m) => m.key), [
    "social_media_views",
    "financials_total_revenue",
    "social_media_watch_time",
  ]);
});

test("every kind asks for the figures its own rates are built from", () => {
  // A rate whose inputs the platform is never asked for is a dash
  // forever — which is exactly the state LinkedIn's save rate was in.
  const needs: Record<string, string[]> = {
    social_media_impressions_per_post: [
      "social_media_impressions",
      "social_media_posts_published",
    ],
    social_media_favourite_rate: ["social_media_favourites", "social_media_video_views"],
    social_media_watch_time_per_view: ["social_media_watch_time", "social_media_views"],
    social_media_save_rate: ["social_media_saves", "social_media_reach"],
    social_media_non_follower_reach: [
      "social_media_reach_from_non_followers",
      "social_media_reach_from_followers",
    ],
    social_media_profile_visit_to_follow: [
      "social_media_follows_gained",
      "social_media_profile_visits",
    ],
  };
  for (const kind of [...PLATFORM_KINDS, null] as (PlatformKind | null)[]) {
    for (const [rate, inputs] of Object.entries(needs)) {
      if (!platformAsks(rate, kind)) continue;
      for (const input of inputs) {
        assert.ok(
          platformAsks(input, kind),
          `${kind} shows ${rate} and is never asked for ${input}`,
        );
      }
    }
  }
});

test("no kind shows a figure that is typed on it and worked out as well", () => {
  // YouTube's click-through rate is typed because YouTube Studio reports
  // it; LinkedIn's is worked out. Both on one screen would be two
  // numbers, both labelled "Click-through rate", disagreeing.
  for (const kind of [...PLATFORM_KINDS, null] as (PlatformKind | null)[]) {
    const both =
      platformAsks("social_media_click_through_rate", kind) &&
      platformAsks("social_media_reported_click_through_rate", kind);
    assert.ok(!both, `${kind} shows both click-through rates`);
  }
});
