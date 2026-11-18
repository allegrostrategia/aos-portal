import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PLATFORM_TREND_CHARTS,
  TREND_CHARTS,
  chartsFor,
  trendMetricKeys,
  trendMonthsNeeded,
} from "./trends.ts";
import { PLATFORM_KINDS } from "./platforms.ts";
import { METRIC_ICONS } from "./metric-icons.ts";
import { niceCeiling } from "../../components/reporting/charts/scale.ts";
import { platformSetFor } from "./platform-metrics.ts";
import type { TrendChartSpec } from "./trends.ts";

/**
 * The declared charts, checked against the metric list they claim to draw.
 *
 * A chart spec is data, so the thing that goes wrong with it is a metric key
 * that does not exist — a typo draws an empty chart with a confident title
 * on it, and nothing else in the stack says a word.
 */

/** Every metric key the migrations actually seed. */
const SEEDED: Set<string> = (() => {
  const keys = new Set<string>();
  for (const file of [
    "supabase/migrations/20260930123000_report_metrics_seed.sql",
    "supabase/migrations/20261028100000_nina_review_metric_list.sql",
  ]) {
    const sql = readFileSync(file, "utf8");
    for (const match of sql.matchAll(/'([a-z_]+_[a-z_]+)'/g)) keys.add(match[1]);
  }
  return keys;
})();

test("the seeded metric list was actually found", () => {
  // Guards the two tests below: an empty set would make both vacuous, which
  // is the way a check like this usually dies.
  assert.ok(SEEDED.size > 100, `only ${SEEDED.size} keys read from the migrations`);
  assert.ok(SEEDED.has("financials_total_revenue"));
});

/**
 * Every declared chart in the file, category ones and per-platform ones.
 *
 * The structural checks below are about the SHAPE of a chart spec — a
 * key that exists, one unit, at most three series — and a chart drawn
 * only on TikTok is as able to get those wrong as one drawn everywhere.
 * They were written when there was one list; the second list is exactly
 * the kind of thing a test like this stops covering silently.
 */
const ALL_CHARTS: [string, TrendChartSpec[]][] = [
  ...Object.entries(TREND_CHARTS).map(
    ([category, charts]) => [category, charts ?? []] as [string, TrendChartSpec[]],
  ),
  ...Object.entries(PLATFORM_TREND_CHARTS).map(
    ([kind, charts]) => [`social_media/${kind}`, charts ?? []] as [string, TrendChartSpec[]],
  ),
];

test("every charted metric key is one the database seeds", () => {
  for (const [category, charts] of ALL_CHARTS) {
    for (const chart of charts ?? []) {
      for (const series of chart.series) {
        assert.ok(
          SEEDED.has(series.metricKey),
          `${category}/${chart.id} draws "${series.metricKey}", which is not a seeded metric`,
        );
      }
      if (chart.targetFor) {
        assert.ok(
          SEEDED.has(chart.targetFor),
          `${category}/${chart.id} targets "${chart.targetFor}", which is not a seeded metric`,
        );
      }
    }
  }
});

test("every metric given its own icon is one the database seeds", () => {
  for (const key of Object.keys(METRIC_ICONS)) {
    assert.ok(SEEDED.has(key), `"${key}" has an icon but is not a seeded metric`);
  }
});

test("a chart's series share one unit, because they share one axis", () => {
  // The shape cannot express a second scale, and this is the test that says
  // why: the moment two units are allowed on one chart, any two lines can
  // be drawn crossing wherever the author wants them to.
  for (const [, charts] of ALL_CHARTS) {
    for (const chart of charts) {
      assert.ok(chart.unit, `${chart.id} has no unit`);
    }
  }
});

test("only a single-series chart fills its area", () => {
  for (const [, charts] of ALL_CHARTS) {
    for (const chart of charts) {
      if (chart.area) {
        assert.equal(
          chart.series.length,
          1,
          `${chart.id} fills its area with ${chart.series.length} series — two washes make a third colour that means nothing`,
        );
      }
    }
  }
});

test("a chart asks for at most three lines, which is what the inks allow", () => {
  for (const [, charts] of ALL_CHARTS) {
    for (const chart of charts) {
      assert.ok(
        chart.series.length <= 3,
        `${chart.id} asks for ${chart.series.length} series`,
      );
    }
  }
});

test("every chart id is unique within its category", () => {
  for (const [category, charts] of ALL_CHARTS) {
    const ids = charts.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${category} repeats a chart id`);
  }
});

test("the keys a category needs come back once each", () => {
  const keys = trendMetricKeys("social_media", "instagram");
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("social_media_reach"));
  assert.ok(keys.includes("social_media_save_rate"));
});

// ---------------------------------------------------------------------------
// §5.2's per-platform charts (Nina, 16 November).

test("a chart is only drawn on a platform that is asked for its figures", () => {
  // The point of the whole exercise: a save rate on LinkedIn was a
  // confident title over an empty panel, because LinkedIn has no saves.
  const linkedin = chartsFor("social_media", "linkedin").map((c) => c.id);
  assert.ok(!linkedin.includes("save-rate-vs-share-rate"));
  assert.ok(!linkedin.includes("reach-and-views"), "LinkedIn reports impressions, not reach");
  assert.ok(linkedin.includes("followers-over-time"), "it does have followers");
  assert.ok(linkedin.includes("impressions-and-members"));

  // And Instagram keeps every one of the three it has always had.
  const instagram = chartsFor("social_media", "instagram").map((c) => c.id);
  assert.deepEqual(instagram, [
    "followers-over-time",
    "reach-and-views",
    "save-rate-vs-share-rate",
  ]);
});

test("a platform's own chart replaces an inherited one of the same id", () => {
  // YouTube's "Subscribers over time" is the same metric under the word
  // YouTube uses, so it takes the follower chart's place rather than
  // appearing beside it.
  const youtube = chartsFor("social_media", "youtube");
  const followers = youtube.filter((c) => c.id === "followers-over-time");
  assert.equal(followers.length, 1, "two charts of one figure, or none");
  assert.equal(followers[0].title, "Subscribers over time");
});

test("no kind's charts repeat an id, after inheriting and replacing", () => {
  // The replace-by-id mechanism is the one thing that could produce two
  // charts with one React key, and a duplicate would render twice.
  for (const kind of [...PLATFORM_KINDS, null]) {
    const ids = chartsFor("social_media", kind).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${kind} repeats a chart id`);
  }
});

test("every kind has something to draw", () => {
  for (const kind of [...PLATFORM_KINDS, null]) {
    const charts = chartsFor("social_media", kind);
    assert.ok(charts.length > 0, `${kind} draws no charts at all`);
    assert.ok(
      trendMonthsNeeded("social_media", kind) > 0,
      `${kind} asks for no months`,
    );
  }
});

test("a chart is only drawn from figures its platform is asked for", () => {
  // Including the per-platform ones: a TikTok chart of Instagram's
  // saves would draw an empty panel on the only platform it appears on,
  // which is the failure this round exists to fix rather than move.
  for (const kind of PLATFORM_KINDS) {
    const asked = new Set(platformSetFor(kind).keys);
    for (const chart of chartsFor("social_media", kind)) {
      for (const series of chart.series) {
        assert.ok(
          asked.has(series.metricKey),
          `${kind}/${chart.id} draws "${series.metricKey}", which ${kind} is never asked for`,
        );
      }
    }
  }
});

test("a category with no charts asks for nothing", () => {
  assert.deepEqual(trendMetricKeys("ads"), []);
  assert.equal(trendMonthsNeeded("ads"), 0);
});

test("the span loaded is the longest any one chart asks for", () => {
  // Social Media has a twelve-month chart and two six-month ones, so one
  // query of twelve serves all three.
  assert.equal(trendMonthsNeeded("social_media"), 12);
});

test("the scale's top is a number a person would have picked", () => {
  assert.equal(niceCeiling(26_420), 30_000);
  assert.equal(niceCeiling(184_500), 200_000);
  assert.equal(niceCeiling(6.9), 8);
  assert.equal(niceCeiling(2.4), 2.5);
  assert.equal(niceCeiling(1_000), 1_000);
  // Never zero: a chart divided by a zero scale draws every point on the
  // axis and looks like a month of nothing.
  assert.equal(niceCeiling(0), 1);
  assert.equal(niceCeiling(-5), 1);
});

/**
 * **Views and impressions never share an axis.**
 *
 * A YouTube click-through rate of around 6% means impressions are
 * roughly fifteen times views, so a chart of both drew the views as
 * slivers against the floor — two numbers on screen and only one of
 * them readable. It is the dual-axis problem without the second axis:
 * two measures of very different scale belong in two charts.
 *
 * Written as a rule over every chart rather than a check on YouTube's,
 * because the pair is the only one in this project where the scales
 * differ by a factor and the next kind to want both would do it again.
 * (Dom, 18 November, off the demo.)
 */
test("no chart draws views and impressions against the same axis", () => {
  for (const [where, charts] of ALL_CHARTS) {
    for (const chart of charts) {
      const keys = chart.series.map((s) => s.metricKey);
      const both =
        keys.includes("social_media_impressions") &&
        (keys.includes("social_media_views") || keys.includes("social_media_video_views"));
      assert.ok(!both, `${where}/${chart.id} puts views and impressions on one axis`);
    }
  }
});

test("YouTube draws its views and its reported click-through rate separately", () => {
  const ids = chartsFor("social_media", "youtube").map((c) => c.id);
  assert.ok(ids.includes("views-over-time"));
  assert.ok(ids.includes("click-through-rate"));
  assert.ok(!ids.includes("views-and-impressions"), "the one that hid the views");

  // The TYPED rate, not the worked-out one: YouTube counts a view
  // differently from an impression-click, so its own figure and a
  // computed one would disagree on the same page (Nina, 16 November).
  const ctr = chartsFor("social_media", "youtube").find((c) => c.id === "click-through-rate");
  assert.deepEqual(
    ctr?.series.map((s) => s.metricKey),
    ["social_media_reported_click_through_rate"],
  );

  // And LinkedIn's click-through chart is still its own, worked out.
  const li = chartsFor("social_media", "linkedin").map((c) => c.id);
  assert.ok(li.includes("engagement-and-clicks"));
  assert.ok(!li.includes("click-through-rate"), "LinkedIn's is the pair, not a line of its own");
});
