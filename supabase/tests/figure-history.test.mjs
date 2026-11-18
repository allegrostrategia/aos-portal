/**
 * A point on a chart is the same arithmetic as the figure on the card.
 *
 * §9's rule, extended backwards in time. The trend charts and sparklines
 * cannot read most of what they draw — Revenue, Profit, Total leads, Save
 * rate and Share rate are all `calc` metrics with no row in `report_values`
 * — so `getFigureHistory` loads their inputs and runs `calculate()` per
 * month. That gives two implementations of "a month's figures" the chance
 * to drift, and the way they drift is silent: a missing input key makes a
 * chart that looks perfectly convincing and is quietly wrong.
 *
 * So this asserts what matters rather than how it is done. The newest point
 * of every series must equal what `getMonthFigures` renders for that month,
 * which is what the card above the chart shows. A key left out of
 * `ENTITY_KEYS`, an entity kind missing from `ENTITIES_NEEDED`, a formula
 * that grows a new input — each one shows up here as a disagreement.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { resolveReportContext } = await import("../../src/lib/reporting/context.ts");
const { getMonthFigures } = await import("../../src/lib/reporting/month-figures.ts");
const { getEntityHistory, getFigureHistory, inputKeysFor } = await import(
  "../../src/lib/reporting/figure-history.ts"
);
const { monthsEndingAt } = await import("../../src/lib/reporting/months.ts");
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { saveOffer, saveOfferMonth } = await import("../../src/lib/reporting/offer-actions.ts");
const { saveSalesRow, saveActuals } = await import("../../src/lib/reporting/sales-actions.ts");
const { saveExpenseCategory, saveExpenses } = await import(
  "../../src/lib/reporting/expense-actions.ts"
);
const { getMetrics } = await import("../../src/lib/reporting/queries.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const JUN = "2026-06-01";
const JUL = "2026-07-01";
const AUG = "2026-08-01";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

const WS = (
  await asMember(db, NINA, () =>
    db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JUN}')).id as id`),
  )
).rows[0].id;

const as = (uid, fn) => {
  configure(db, uid);
  return fn();
};

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};

const save = (category, month, values) =>
  as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month,
        category,
        ...Object.fromEntries(Object.entries(values).map(([k, v]) => [`v:${k}`, v])),
      }),
    ),
  );

/**
 * June, which is OFF the axis the charts draw.
 *
 * It is here so the next assertion means something: net follower growth is
 * this month minus last month, so July's point can only be real if the
 * loader went one month further back than it was asked for.
 */
await save("social_media", JUN, { social_media_followers_at_month_end: 500 });

/** Three months, so a trend has a shape and the middle one has both sides. */
for (const [month, scale] of [
  [JUL, 1],
  [AUG, 2],
  [SEP, 3],
]) {
  await save("social_media", month, {
    social_media_followers_at_month_end: 1000 * scale,
    social_media_reach: 30000 * scale,
    social_media_likes_plus_comments: 900 * scale,
    social_media_saves: 120 * scale,
    social_media_shares: 60 * scale,
    social_media_posts_published: 12,
    // Read by no formula at all, which is the point of the test below.
    social_media_views: 90000 * scale,
  });
  await save("leads_conversions", month, {
    leads_conversions_new_leads_from_social: 12 * scale,
    leads_conversions_new_leads_from_email: 6 * scale,
    leads_conversions_new_clients: 4,
  });

}

const offerId = await as(NINA, async () => {
  await saveOffer(
    null,
    form({
      workspace_id: WS,
      name: "1:1 Coaching",
      price: 500,
      pricing_model: "one_off",
      hourly_cost: 40,
    }),
  );
  const { rows } = await db.query(
    `select id from public.report_entities where workspace_id = '${WS}' and entity_type = 'offer'`,
  );
  return rows[0].id;
});

// **No revenue here since 13 November**: an offer's money is the
// Financials row linked to it, entered below. The figures are the same
// 3,000 / 4,500 / 6,000 this file has always charted.
for (const month of [JUL, AUG, SEP]) {
  await as(NINA, () =>
    saveOfferMonth(
      null,
      form({
        workspace_id: WS,
        month,
        [`v:offers_units_sold:${offerId}`]: 6,
        [`v:offers_hours_spent_delivering:${offerId}`]: 28,
        [`v:offers_other_direct_costs:${offerId}`]: 200,
      }),
    ),
  );
}

/**
 * And the same costs on the expense grid, which is where the four cost
 * totals come from since 13 November: £300 fixed, £250 a month of
 * variable, £500 of team — the figures this file has always charted.
 */
await as(NINA, async () => {
  const made = {};
  for (const [name, bucket] of [["Software", "fixed"], ["Ads", "variable"], ["Staff", "team"]]) {
    await saveExpenseCategory(null, form({ workspace_id: WS, name, bucket }));
    const { rows } = await db.query(
      `select id from public.report_expense_categories
        where workspace_id = '${WS}' and name = '${name}'`,
    );
    made[bucket] = rows[0].id;
  }
  for (const [month, scale] of [[JUL, 1], [AUG, 2], [SEP, 3]]) {
    await saveExpenses(
      null,
      form({
        workspace_id: WS,
        month,
        [`cell:${made.fixed}:${month}`]: 300,
        [`cell:${made.variable}:${month}`]: 250 * scale,
        [`cell:${made.team}:${month}`]: 500,
      }),
    );
  }
});

/**
 * The same money on the Actual grid, which is where revenue and profit
 * come from since 13 November — one row linked to the offer, one not.
 *
 * The figures are the ones this file has always charted: £3,000, £4,500
 * and £6,000 from the offer, and £100, £200, £300 of other income.
 */
await as(NINA, async () => {
  for (const [name, link] of [
    // Linked to the offer, which is what makes its money that offer's
    // revenue on the Offers page as well as the month's.
    ["1:1 Coaching", offerId],
    ["A bespoke client", ""],
  ]) {
    await saveSalesRow(
      null,
      form({
        workspace_id: WS,
        name,
        row_type: link ? "offer" : "client",
        offer_entity_id: link,
        recurrence: "none",
      }),
    );
  }
  const { rows } = await db.query(
    `select id, offer_entity_id from public.report_sales_rows
      where workspace_id = '${WS}' order by sort_order`,
  );
  const linked = rows.find((r) => r.offer_entity_id !== null).id;
  const bespoke = rows.find((r) => r.offer_entity_id === null).id;

  for (const [month, revenue, other] of [
    [JUL, 3000, 100],
    [AUG, 4500, 200],
    [SEP, 6000, 300],
  ]) {
    await saveActuals(
      null,
      form({
        workspace_id: WS,
        month,
        [`cell:${linked}:${month}`]: revenue,
        [`cell:${bespoke}:${month}`]: other,
      }),
    );
  }
});

/** The metrics the Overview and Social Media charts actually draw. */
const CHARTED = [
  // Worked out, every one of them, and the reason this file exists.
  "financials_total_revenue",
  "financials_profit",
  "leads_conversions_total_leads",
  "social_media_save_rate",
  "social_media_share_rate",
  "social_media_net_follower_growth",
  "social_media_engagement_rate",
  // Stored, as the control: if these disagreed the loader itself is wrong.
  "social_media_followers_at_month_end",
  "social_media_reach",
  "leads_conversions_new_clients",
];

async function historyFor(month, keys = CHARTED) {
  configure(db, NINA);
  const metrics = await getMetrics();
  return getFigureHistory({
    workspaceId: WS,
    months: monthsEndingAt(month, 3),
    metricKeys: keys,
    metrics,
  });
}

test("the newest point of every series is the figure the card shows", async () => {
  configure(db, NINA);
  const ctx = await resolveReportContext({ workspace: WS, month: "2026-09" }, "2026-10-02");
  const figures = await getMonthFigures(ctx);
  const history = await historyFor(SEP);

  const disagreements = [];
  for (const key of CHARTED) {
    const series = history.get(key);
    const onChart = series[series.length - 1];
    const onCard = figures.figure(key);
    if (onChart !== onCard) {
      disagreements.push(`${key}: chart ${onChart}, card ${onCard}`);
    }
  }

  assert.deepEqual(disagreements, [], "§9: a point and a card must never disagree");
});

test("they are not agreeing by both being empty", async () => {
  // The positive control. Two sets of nulls match happily and prove
  // nothing, which is how three §9 bugs survived before.
  const history = await historyFor(SEP);

  const real = CHARTED.filter((key) => {
    const series = history.get(key);
    return series[series.length - 1] !== null;
  });

  assert.deepEqual(
    real.sort(),
    [...CHARTED].sort(),
    "every charted metric should have a figure for September",
  );
  // And the two that are pulled from the offers specifically, since those
  // are the ones a missing ENTITY_KEYS entry would silently empty.
  assert.equal(history.get("financials_total_revenue").at(-1), 6300);
  assert.equal(history.get("financials_profit").at(-1), 4750);
});

test("every month of the series is computed, not only the newest", async () => {
  // The newest point agreeing could be a coincidence of the newest month
  // being the only one loaded. These three were seeded on a rising scale.
  const history = await historyFor(SEP);

  assert.deepEqual(history.get("social_media_followers_at_month_end"), [1000, 2000, 3000]);
  assert.deepEqual(history.get("financials_total_revenue"), [3100, 4700, 6300]);
  // Saves ÷ reach, worked out from two stored figures in each month.
  assert.deepEqual(history.get("social_media_save_rate"), [0.4, 0.4, 0.4]);
});

test("a formula defined against last month works on the oldest point too", async () => {
  // Net follower growth is this month minus last month, so July's point
  // needs June loaded — one month further back than the axis asks for.
  // Without it the oldest point of every such series is a dash, which
  // looks like a quiet month rather than a loader that stopped short.
  const history = await historyFor(SEP);

  // July is 1,000 against June's 500, and June is not on the axis.
  assert.deepEqual(history.get("social_media_net_follower_growth"), [500, 1000, 1000]);
});

test("a month with nothing entered is a gap, not a zero", async () => {
  // Five months, and the oldest two have nothing: the workspace starts in
  // June. They must come back null, because a zero there would draw a
  // crash to the floor that never happened.
  configure(db, NINA);
  const metrics = await getMetrics();
  const history = await getFigureHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 5),
    metricKeys: ["social_media_followers_at_month_end", "financials_total_revenue"],
    metrics,
  });

  assert.equal(history.get("social_media_followers_at_month_end")[0], null);
  assert.equal(history.get("financials_total_revenue")[0], null);
});

test("a stored metric no formula reads is still loaded", async () => {
  // The bug this exists for. Save rate is calculated, so Social Media is
  // a category that has to be worked out — and the first version took
  // that to mean every Social Media key would arrive through
  // `inputKeysFor`. Views is read by no formula, so it was quietly never
  // loaded, and "Reach and views" drew its empty state with a year of
  // figures sitting in the database. Caught in the browser, not here.
  const history = await historyFor(SEP, ["social_media_views", "social_media_save_rate"]);

  assert.deepEqual(history.get("social_media_views"), [90000, 180000, 270000]);
  assert.ok(history.get("social_media_save_rate").at(-1) !== null, "and the calc one too");
});

test("the input keys are read off the formulas, not off a list", async () => {
  // The recorder: if this returns nothing, every calc series goes quietly
  // null and the agreement tests above would be comparing dashes.
  const social = inputKeysFor("social_media");
  assert.ok(social.includes("social_media_saves"), social.join(", "));
  assert.ok(social.includes("social_media_reach"));

  const financials = inputKeysFor("financials");
  // Cash in bank is the one figure Financials still reads through the
  // lookup; everything else comes off the two grids and the expense one.
  assert.ok(
    financials.includes("financials_cash_in_bank_at_month_end"),
    financials.join(", "),
  );
  // **Revenue is not an input key any more**, and that is the point of
  // the routing: it is not typed anywhere, so there is no key to read.
  // It comes off the Actual grid, which `getFigureHistory` loads itself.
  assert.ok(!financials.includes("financials_other_income"), financials.join(", "));
});

test("a client reads their published months and no draft", async () => {
  // The whole visibility question in one assertion. August is published,
  // September is not, so a client's chart must have August's point and a
  // gap where September is — not the draft figure, and not a zero.
  const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");
  // In order, because publishing out of order is refused: an earlier
  // draft would be frozen into a later month's snapshot.
  for (const month of [JUN, JUL, AUG]) {
    const result = await as(NINA, () =>
      publishMonth(null, form({ workspace_id: WS, month })),
    );
    assert.equal(result?.error, undefined, `publishing ${month}: ${result?.error}`);
  }

  configure(db, CLIENT);
  const metrics = await getMetrics();
  const history = await getFigureHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 3),
    metricKeys: ["social_media_followers_at_month_end", "financials_total_revenue"],
    metrics,
  });

  assert.deepEqual(history.get("social_media_followers_at_month_end"), [1000, 2000, null]);
  assert.equal(history.get("financials_total_revenue").at(-1), null, "September is a draft");
  assert.equal(history.get("financials_total_revenue")[1], 4700, "August is published");
});

/**
 * The other history loader: one stored metric, per row, across months.
 *
 * `offers_revenue_this_month` needs no `calculate()` — it is typed against
 * the offer — so "Revenue by offer" is a plain query. What it shares with
 * the one above is the thing that goes wrong quietly: a window off by a
 * month, or a row landing in the wrong slot, draws a confident chart with
 * a month missing from it and says nothing. The offer seeded at the top of
 * this file earns 3,000 in July, 4,500 in August and 6,000 in September.
 */
test("an offer's own revenue, month by month", async () => {
  configure(db, NINA);
  const history = await getEntityHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 4),
    metricKey: "offers_revenue_this_month",
    entityIds: [offerId],
  });

  // June is before the offer existed, and is a gap rather than a zero.
  assert.deepEqual(history.get(offerId), [null, 3000, 4500, 6000]);
});

test("the newest point is the figure on the offer's own card", async () => {
  // §9 again, for the per-row loader: the last bar of the chart and the
  // card above it are the same month's revenue, or one of them is wrong.
  configure(db, NINA);
  const ctx = await resolveReportContext({ workspace: WS, month: "2026-09" }, "2026-10-02");
  const figures = await getMonthFigures(ctx);
  const onCard = figures.offerRows.find((row) => row.id === offerId);

  const history = await getEntityHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 6),
    metricKey: "offers_revenue_this_month",
    entityIds: [offerId],
  });

  assert.equal(onCard?.revenue, 6000, "the card, as a control");
  assert.equal(history.get(offerId).at(-1), onCard?.revenue);
  // And the series is exactly as long as the axis asked for, whatever
  // came back — the promise the caller lines its labels up against.
  assert.equal(history.get(offerId).length, 6);
});

test("an entity nobody asked about is not in the answer", async () => {
  configure(db, NINA);
  const history = await getEntityHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 3),
    metricKey: "offers_revenue_this_month",
    entityIds: [],
  });
  assert.equal(history.size, 0, "no offers asked for, no series back");
});

/**
 * **A chart drew Instagram's arithmetic under LinkedIn's heading.**
 *
 * `getFigureHistory` discovers which raw figures to load by RUNNING the
 * formula with a recording lookup, then runs it again per month. Both
 * runs were made with no platform kind — so for every month but the
 * newest, Social Media's rates were worked out the Instagram way: a
 * LinkedIn engagement rate measured against a reach LinkedIn does not
 * report, which is null, and a click-through rate that never appeared
 * at all. The card above the chart had the kind and was right. (18
 * November, found on the demo: "Engagement rate vs click-through rate"
 * drew its empty state on a client with thirteen months of figures,
 * and the year grid was missing three whole rows.)
 *
 * The existing tests above could not catch it: they save Social Media
 * at month level, so the platform is "none yet", whose kind is
 * Instagram — and Instagram's arithmetic is the arithmetic they were
 * comparing against.
 */
const LI = await (async () => {
  await db.exec(`
    insert into public.report_entities (workspace_id, entity_type, name, sort_order, platform_kind)
    values ('${WS}', 'social_platform', 'LinkedIn', 1, 'linkedin');
  `);
  const { rows } = await asMember(db, NINA, () =>
    db.query(`select id from public.report_entities where name = 'LinkedIn'`),
  );
  return rows[0].id;
})();

for (const [month, scale] of [
  [JUL, 1],
  [AUG, 2],
  [SEP, 3],
]) {
  await as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month,
        category: "social_media",
        platform_id: LI,
        "v:social_media_followers_at_month_end": 2000 * scale,
        "v:social_media_posts_published": 10,
        "v:social_media_impressions": 20000 * scale,
        "v:social_media_members_reached": 9000 * scale,
        "v:social_media_reactions": 600 * scale,
        "v:social_media_comments": 90 * scale,
        "v:social_media_reposts": 30 * scale,
        "v:social_media_link_clicks": 200 * scale,
        "v:social_media_profile_visits": 800 * scale,
      }),
    ),
  );
}

const LINKEDIN_RATES = [
  "social_media_engagement_rate",
  "social_media_click_through_rate",
  "social_media_profile_view_rate",
  "social_media_impressions_per_post",
];

test("a LinkedIn chart is worked out LinkedIn's way, every month of it", async () => {
  configure(db, NINA);
  const ctx = await resolveReportContext(
    { workspace: WS, month: "2026-09", platform: LI },
    "2026-10-02",
  );
  const figures = await getMonthFigures(ctx);
  const metrics = await getMetrics();
  const history = await getFigureHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 3),
    metricKeys: LINKEDIN_RATES,
    metrics,
    platformKind: "linkedin",
    platform: LI,
  });

  const disagreements = [];
  for (const key of LINKEDIN_RATES) {
    const series = history.get(key);
    // Nothing may be empty: that is how this bug looked, and two nulls
    // agree happily.
    assert.ok(
      series.every((point) => point !== null),
      `${key} has a blank month: ${JSON.stringify(series)}`,
    );
    if (series.at(-1) !== figures.figure(key)) {
      disagreements.push(`${key}: chart ${series.at(-1)}, card ${figures.figure(key)}`);
    }
  }
  assert.deepEqual(disagreements, [], "§9, per platform kind");

  // And the number itself, so "they agree" is not two copies of one bug:
  // (600 + 90 + 30) × 3 reactions, comments and reposts ÷ 20,000 × 3
  // impressions = 3.6%, measured against impressions as LinkedIn does.
  assert.equal(history.get("social_media_engagement_rate").at(-1).toFixed(2), "3.60");
  // 200 × 3 link clicks ÷ 60,000 = 1%.
  assert.equal(history.get("social_media_click_through_rate").at(-1), 1);
});

test("without the kind it reverts to the arithmetic that was wrong", async () => {
  // The negative control, and the shape of the bug: the same months,
  // the same platform, no kind — Instagram's formula against a reach
  // LinkedIn does not report.
  configure(db, NINA);
  const metrics = await getMetrics();
  const history = await getFigureHistory({
    workspaceId: WS,
    months: monthsEndingAt(SEP, 3),
    metricKeys: LINKEDIN_RATES,
    metrics,
    platform: LI,
  });

  assert.equal(
    history.get("social_media_engagement_rate").at(-1),
    null,
    "measured against a reach that is not there",
  );
  assert.equal(
    history.get("social_media_click_through_rate").at(-1),
    null,
    "and the click-through rate was never drawn at all",
  );
});
