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
  financialsCells,
}: {
  metrics: Metric[];
  monthValues?: Record<string, number | null>;
  entities?: { id: string; entity_type: string; active: boolean }[];
  entityValues?: Record<string, number | null>;
  openingInUse?: unknown;
  financialsCells?: { received: number; costs: number };
}) {
  return {
    metrics,
    figure: (key: string) => monthValues[key] ?? null,
    openingClients: { inUse: openingInUse, unused: [] },
    ...(financialsCells ? { financialsCells } : {}),
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

test("Social Media with no platform row yet is asked at month level", () => {
  const metrics: Metric[] = [
    { key: "social_media_followers_at_month_end", category: "social_media", input_type: "core", entity_type: "social_platform" },
  ];
  // No entities at all, and still asked. A client with no platform has
  // never saved a Social Media figure — the first save makes the row —
  // so "nothing set up, nothing owed" would tick a section nobody has
  // touched. That is the one way Social Media differs from Funnels.
  const figures = figuresWith({
    metrics,
    monthValues: { social_media_followers_at_month_end: 1200 },
    entities: [],
  });
  assert.deepEqual(categoryCompletion(figures, "social_media"), { filled: 1, total: 1 });
});

test("and with three platforms, a figure counts only when all three have it", () => {
  // Nina, 11 November: a target per platform, which means a section
  // finished per platform too. Before today this read "filled" as soon
  // as Instagram was done, and LinkedIn and TikTok sat empty with a tick
  // beside them.
  const metrics: Metric[] = [
    { key: "social_media_followers_at_month_end", category: "social_media", input_type: "core", entity_type: "social_platform" },
    { key: "social_media_posts_published", category: "social_media", input_type: "core", entity_type: "social_platform" },
  ];
  const entities = [
    { id: "ig", entity_type: "social_platform", active: true },
    { id: "li", entity_type: "social_platform", active: true },
    { id: "tt", entity_type: "social_platform", active: true },
  ];

  const partly = figuresWith({
    metrics,
    entities,
    entityValues: {
      "social_media_followers_at_month_end|ig": 26420,
      "social_media_followers_at_month_end|li": 3120,
      "social_media_posts_published|ig": 22,
      "social_media_posts_published|li": 9,
      "social_media_posts_published|tt": 4,
    },
  });
  assert.deepEqual(
    categoryCompletion(partly, "social_media"),
    { filled: 1, total: 2 },
    "TikTok has no followers figure, so that one is not filled",
  );

  const all = figuresWith({
    metrics,
    entities,
    entityValues: {
      "social_media_followers_at_month_end|ig": 26420,
      "social_media_followers_at_month_end|li": 3120,
      "social_media_followers_at_month_end|tt": 800,
      "social_media_posts_published|ig": 22,
      "social_media_posts_published|li": 9,
      "social_media_posts_published|tt": 4,
    },
  });
  assert.deepEqual(categoryCompletion(all, "social_media"), { filled: 2, total: 2 });

  // A retired platform is not chased: it is the record of somewhere they
  // used to post, which is what retiring means everywhere else.
  const retired = figuresWith({
    metrics,
    entities: [...entities.slice(0, 2), { id: "tt", entity_type: "social_platform", active: false }],
    entityValues: {
      "social_media_followers_at_month_end|ig": 26420,
      "social_media_followers_at_month_end|li": 3120,
      "social_media_posts_published|ig": 22,
      "social_media_posts_published|li": 9,
    },
  });
  assert.deepEqual(categoryCompletion(retired, "social_media"), { filled: 2, total: 2 });
});


/**
 * Financials, which has no core metric left to count.
 *
 * Revenue is the Actual grid and the four cost totals are the expense
 * grid's buckets, so every figure on that section is pulled — and
 * counting core metrics would mark it finished the moment it is opened,
 * which is the opposite of the failure the rest of this file is about.
 */
const FINANCIALS: Metric[] = [
  { key: "financials_revenue_from_offers", category: "financials", input_type: "pulled", entity_type: null },
  { key: "financials_fixed_costs", category: "financials", input_type: "pulled", entity_type: null },
  { key: "financials_cash_in_bank_at_month_end", category: "financials", input_type: "optional", entity_type: null },
];

test("Financials is counted by its grids, not by a core field it no longer has", () => {
  const empty = figuresWith({ metrics: FINANCIALS, financialsCells: { received: 0, costs: 0 } });
  assert.deepEqual(categoryCompletion(empty, "financials"), { filled: 0, total: 1 });

  const money = figuresWith({ metrics: FINANCIALS, financialsCells: { received: 1, costs: 0 } });
  assert.deepEqual(categoryCompletion(money, "financials"), { filled: 1, total: 1 });

  const costsOnly = figuresWith({ metrics: FINANCIALS, financialsCells: { received: 0, costs: 2 } });
  assert.deepEqual(categoryCompletion(costsOnly, "financials"), { filled: 1, total: 1 });
});

test("a month that genuinely took nothing is answered by a typed zero", () => {
  // Counted, not summed: a cell holding 0 is somebody saying "nothing
  // came in", and a sum cannot tell that from nobody having looked.
  const zeroMonth = figuresWith({
    metrics: FINANCIALS,
    financialsCells: { received: 1, costs: 0 },
  });
  assert.equal(categoryCompletion(zeroMonth, "financials").filled, 1);
});

test("a caller that does not count the grids leaves Financials owing nothing", () => {
  // Every caller written before the grids existed, and the honest answer
  // for them: not asked is not the same as not done.
  const old = figuresWith({ metrics: FINANCIALS });
  assert.deepEqual(categoryCompletion(old, "financials"), { filled: 0, total: 0 });
});
