import assert from "node:assert/strict";
import { test } from "node:test";

import { categoryCompletion } from "./completion.ts";

/**
 * "Still to fill in" (§8.1), which had no tests of its own and three
 * ways to show a section that could never be finished.
 *
 * `MonthFigures` is large and mostly irrelevant here, so these build the
 * four parts `categoryCompletion` actually reads. A fake is the right
 * shape for this one: the function is pure given those four, and a real
 * month would mean a database for a question that is arithmetic.
 */
type Metric = {
  key: string;
  category: string;
  input_type: string;
  entity_type: string | null;
};

function figuresWith({
  metrics,
  monthValues = {},
  entities = [],
  entityValues = {},
  openingInUse = null,
}: {
  metrics: Metric[];
  monthValues?: Record<string, number | null>;
  entities?: { id: string; entity_type: string; active: boolean }[];
  entityValues?: Record<string, number | null>;
  openingInUse?: unknown;
}) {
  return {
    metrics,
    figure: (key: string) => monthValues[key] ?? null,
    openingClients: { inUse: openingInUse, unused: [] },
    data: {
      entities,
      values: { get: (key: string, entityId: string) => entityValues[`${key}|${entityId}`] ?? null },
    },
  };
}

const CE: Metric[] = [
  { key: "client_experience_clients_at_start_opening", category: "client_experience", input_type: "core", entity_type: null },
  { key: "client_experience_clients_who_left", category: "client_experience", input_type: "core", entity_type: null },
  { key: "client_experience_renewals_and_upsells", category: "client_experience", input_type: "core", entity_type: null },
  { key: "client_experience_issues_raised", category: "client_experience", input_type: "core", entity_type: null },
  { key: "client_experience_testimonials_received", category: "client_experience", input_type: "optional", entity_type: null },
];

test("only the core fields are counted, never the optional ones", () => {
  const figures = figuresWith({
    metrics: CE,
    monthValues: {
      client_experience_clients_who_left: 1,
      client_experience_renewals_and_upsells: 2,
      client_experience_issues_raised: 0,
    },
    openingInUse: { month: "2026-07-01", value: 40 },
  });
  // Four core, all four answered — the optional one is not asked about.
  assert.deepEqual(categoryCompletion(figures, "client_experience"), {
    filled: 4,
    total: 4,
  });
});

test("the figure asked once counts from the month it was answered in", () => {
  // It is entered one time and carried forward. Counted monthly it would
  // hold Client Experience open for ever.
  const answered = {
    client_experience_clients_who_left: 1,
    client_experience_renewals_and_upsells: 2,
    client_experience_issues_raised: 0,
  };
  const laterMonth = figuresWith({
    metrics: CE,
    monthValues: answered,
    openingInUse: { month: "2026-07-01", value: 40 },
  });
  assert.deepEqual(categoryCompletion(laterMonth, "client_experience"), {
    filled: 4,
    total: 4,
  });

  // And it is still asked when it has never been answered at all.
  const neverAnswered = figuresWith({ metrics: CE, monthValues: answered, openingInUse: null });
  assert.deepEqual(categoryCompletion(neverAnswered, "client_experience"), {
    filled: 3,
    total: 4,
  });
});

const FUNNELS: Metric[] = [
  { key: "funnels_landing_page_views", category: "funnels", input_type: "core", entity_type: "funnel" },
  { key: "funnels_opt_ins", category: "funnels", input_type: "core", entity_type: "funnel" },
  { key: "funnels_purchases", category: "funnels", input_type: "core", entity_type: "funnel" },
];

test("a row-backed section with no rows owes nothing", () => {
  // Nothing set up means nothing to fill in. It read 0 of 3 — a section
  // permanently unfinished that was never going to hold anything.
  const figures = figuresWith({ metrics: FUNNELS, entities: [] });
  assert.deepEqual(categoryCompletion(figures, "funnels"), { filled: 0, total: 0 });
});

test("a row-backed section needs every row, not just one", () => {
  const entities = [
    { id: "a", entity_type: "funnel", active: true },
    { id: "b", entity_type: "funnel", active: true },
  ];
  const onlyOneFilled = figuresWith({
    metrics: FUNNELS,
    entities,
    entityValues: {
      "funnels_landing_page_views|a": 100,
      "funnels_opt_ins|a": 10,
      "funnels_purchases|a": 1,
    },
  });
  // Two funnels, one of them done: no core metric is finished, because
  // each is only finished when every funnel has it.
  assert.deepEqual(categoryCompletion(onlyOneFilled, "funnels"), { filled: 0, total: 3 });

  const bothFilled = figuresWith({
    metrics: FUNNELS,
    entities,
    entityValues: {
      "funnels_landing_page_views|a": 100, "funnels_landing_page_views|b": 200,
      "funnels_opt_ins|a": 10, "funnels_opt_ins|b": 20,
      "funnels_purchases|a": 1, "funnels_purchases|b": 2,
    },
  });
  assert.deepEqual(categoryCompletion(bothFilled, "funnels"), { filled: 3, total: 3 });
});

test("a retired row is not still being asked for", () => {
  const figures = figuresWith({
    metrics: FUNNELS,
    entities: [
      { id: "a", entity_type: "funnel", active: true },
      { id: "gone", entity_type: "funnel", active: false },
    ],
    entityValues: {
      "funnels_landing_page_views|a": 100,
      "funnels_opt_ins|a": 10,
      "funnels_purchases|a": 1,
    },
  });
  assert.deepEqual(categoryCompletion(figures, "funnels"), { filled: 3, total: 3 });
});

test("Ads and Offers are row-backed too, which only Offers used to be", () => {
  for (const [category, entityType, key] of [
    ["ads", "ad_campaign", "ads_spend"],
    ["offers", "offer", "offers_units_sold"],
  ] as const) {
    const metrics: Metric[] = [{ key, category, input_type: "core", entity_type: entityType }];
    assert.deepEqual(
      categoryCompletion(figuresWith({ metrics, entities: [] }), category),
      { filled: 0, total: 0 },
      `${category} with no rows owes nothing`,
    );
    assert.deepEqual(
      categoryCompletion(
        figuresWith({
          metrics,
          entities: [{ id: "x", entity_type: entityType, active: true }],
          entityValues: { [`${key}|x`]: 5 },
        }),
        category as never,
      ),
      { filled: 1, total: 1 },
      `${category} reads its per-row figures`,
    );
  }
});

test("Social Media is not row-backed, because one platform row resolves itself", () => {
  const metrics: Metric[] = [
    { key: "social_media_followers_at_month_end", category: "social_media", input_type: "core", entity_type: "social_platform" },
  ];
  // No entities at all, and still asked — `figure()` resolves the single
  // platform, so treating it as row-backed would wrongly say "nothing owed".
  const figures = figuresWith({
    metrics,
    monthValues: { social_media_followers_at_month_end: 1200 },
    entities: [],
  });
  assert.deepEqual(categoryCompletion(figures, "social_media"), { filled: 1, total: 1 });
});
