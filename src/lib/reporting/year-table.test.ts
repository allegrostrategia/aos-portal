import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildEntityYearRows, buildYearRows, calendarYear, PER_UNIT_METRICS, splitYearRows,
  summarise, summaryFor, summaryLabel,
} from "./year-table.ts";

const metric = (key: string, label: string, unit: string) =>
  ({ key, label, unit, category: "email", input_type: "core", good_direction: "up",
     entity_type: null, formula: null, sort_order: 1 }) as never;

test("the calendar year, January first, whatever month is being read", () => {
  assert.deepEqual(calendarYear("2026-07-01").slice(0, 2), ["2026-01-01", "2026-02-01"]);
  assert.equal(calendarYear("2026-07-01").length, 12);
  assert.equal(calendarYear("2026-01-01")[11], "2026-12-01");
});

test("counts and money add up", () => {
  assert.deepEqual(summarise("count", [1, 2, 3]), { value: 6, kind: "total" });
  assert.deepEqual(summarise("currency", [100, 200]), { value: 300, kind: "total" });
});

test("a year of percentages does not add up — it averages", () => {
  // Twelve months of a 40% open rate is 40%, not 480%.
  assert.deepEqual(summarise("percent", [40, 40, 40]), { value: 40, kind: "average" });
});

test("the average is over the months that have a figure, not over twelve", () => {
  // A client who started in June is not averaged against five blanks.
  const out = summarise("percent", [null, null, 50, 30, null]);
  assert.equal(out.value, 40);
});

test("nothing entered all year is a blank summary, not a zero", () => {
  assert.deepEqual(summarise("count", [null, null]), { value: null, kind: "total" });
});

test("a level takes its last reading, because a year of followers is not a sum", () => {
  const history = new Map([["email_list_size_at_month_end", [100, 200, 300, null]]]);
  const [row] = buildYearRows([metric("email_list_size_at_month_end", "List size at month end", "count")], history);
  assert.equal(row.summary.value, 300, "the sum would have said 600");
  assert.equal(summaryLabel(row), "Latest");
});

test("a row with nothing in it all year is left out", () => {
  const history = new Map([["email_new_subscribers", [null, null]]]);
  assert.deepEqual(buildYearRows([metric("email_new_subscribers", "New subscribers", "count")], history), []);
});

test("a missing key is blanks, not a crash", () => {
  const rows = buildYearRows([metric("email_emails_sent", "Emails sent", "count")], new Map());
  assert.deepEqual(rows, []);
});

test("Financials splits the four P&L lines out, and keeps the buckets below", () => {
  const rows = [
    "financials_total_revenue", "financials_fixed_costs", "financials_total_costs",
    "financials_profit", "financials_variable_costs", "financials_profit_margin",
  ].map((key) => ({ key, label: key, unit: "currency", goodDirection: "up",
      values: new Array(12).fill(1), summary: { value: 12, kind: "total" } }) as never);

  const { headline, rest } = splitYearRows("financials", rows);
  assert.deepEqual(headline.map((r) => (r as { key: string }).key), [
    "financials_total_revenue", "financials_total_costs",
    "financials_profit", "financials_profit_margin",
  ], "in the order a P&L is read, not the order they arrived");
  assert.deepEqual(rest.map((r) => (r as { key: string }).key), [
    "financials_fixed_costs", "financials_variable_costs",
  ], "the buckets stay in the main table");
});

test("every other page keeps one table", () => {
  const rows = [{ key: "email_new_subscribers", label: "x", unit: "count", goodDirection: "up",
    values: new Array(12).fill(1), summary: { value: 12, kind: "total" } }] as never[];
  const { headline, rest } = splitYearRows("email", rows);
  assert.equal(headline.length, 0);
  assert.equal(rest.length, 1);
});

test("a P&L line nobody has entered does not leave a hole in the headline table", () => {
  const rows = [{ key: "financials_total_revenue", label: "x", unit: "currency", goodDirection: "up",
    values: new Array(12).fill(1), summary: { value: 12, kind: "total" } }] as never[];
  assert.equal(splitYearRows("financials", rows).headline.length, 1);
});

/**
 * **"Impressions per post: 3,156 TOTAL"** (Dom, 18 November, from the
 * LinkedIn year grid). The months averaged 263 and the Year column added
 * them up, because the only rule in here was the unit's and a count
 * totals. A figure that is already a division has to average however its
 * unit prints.
 */
test("a per-post figure averages, although its unit is a count", () => {
  const history = new Map([["social_media_impressions_per_post", [200, 300, 280, null]]]);
  const [row] = buildYearRows(
    [metric("social_media_impressions_per_post", "Impressions per post", "count")],
    history,
  );
  assert.equal(row.summary.value, 260, "the sum would have said 780");
  assert.equal(row.summary.kind, "average");
  assert.equal(summaryLabel(row), "Average");
});

test("and so does a cost per lead, which is money", () => {
  // £12 in January plus £15 in February is not £27 of cost per lead.
  assert.deepEqual(summaryFor("ads_cost_per_lead", "currency", [12, 15]), {
    value: 13.5,
    kind: "average",
  });
  // The same figure under a campaign, which is the only way Ads is read.
  const history = new Map([
    ["ads_cost_per_lead", new Map([["c1", [12, 15, null] as (number | null)[]]])],
  ]);
  const [row] = buildEntityYearRows(
    [metric("ads_cost_per_lead", "Cost per lead", "currency")],
    [{ id: "c1", name: "Spring" }],
    history,
  );
  assert.equal(row.summary.value, 13.5);
  assert.equal(summaryLabel(row), "Average");
});

test("the average is over the months that have one, and nothing is blank", () => {
  assert.deepEqual(summaryFor("social_media_views_per_post", "count", [null, null]), {
    value: null,
    kind: "average",
  });
  assert.equal(summaryFor("social_media_views_per_post", "count", [null, 90, null]).value, 90);
});

test("a level still wins over the per-unit rule, and a plain count still totals", () => {
  // Neither list claims the other's figures, and nothing outside them moved.
  assert.equal(summaryFor("email_list_size_at_month_end", "count", [100, 200]).value, 200);
  assert.deepEqual(summaryFor("social_media_reach", "count", [10, 20]), {
    value: 30,
    kind: "total",
  });
});

/**
 * A flow that reads like a per-unit figure, and is not. Thirty sales at
 * the early-bird price across a year really is thirty sales — which is
 * why the list is named rather than a match on `_per_`.
 */
test("sales per price option is a total, although its key says per", () => {
  assert.ok(!PER_UNIT_METRICS.has("launches_sales_per_price_option"));
  assert.deepEqual(summaryFor("launches_sales_per_price_option", "count", [18, 12]), {
    value: 30,
    kind: "total",
  });
});
