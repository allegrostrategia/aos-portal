import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TREND_CHARTS, trendMetricKeys, trendMonthsNeeded } from "./trends.ts";
import { METRIC_ICONS } from "./metric-icons.ts";
import { niceCeiling } from "../../components/reporting/charts/scale.ts";

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

test("every charted metric key is one the database seeds", () => {
  for (const [category, charts] of Object.entries(TREND_CHARTS)) {
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
  for (const charts of Object.values(TREND_CHARTS)) {
    for (const chart of charts ?? []) {
      assert.ok(chart.unit, `${chart.id} has no unit`);
    }
  }
});

test("only a single-series chart fills its area", () => {
  for (const charts of Object.values(TREND_CHARTS)) {
    for (const chart of charts ?? []) {
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
  for (const charts of Object.values(TREND_CHARTS)) {
    for (const chart of charts ?? []) {
      assert.ok(
        chart.series.length <= 3,
        `${chart.id} asks for ${chart.series.length} series`,
      );
    }
  }
});

test("every chart id is unique within its category", () => {
  for (const [category, charts] of Object.entries(TREND_CHARTS)) {
    const ids = (charts ?? []).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${category} repeats a chart id`);
  }
});

test("the keys a category needs come back once each", () => {
  const keys = trendMetricKeys("social_media");
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("social_media_reach"));
  assert.ok(keys.includes("social_media_save_rate"));
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
