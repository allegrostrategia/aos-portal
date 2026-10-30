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
const { getFigureHistory, inputKeysFor } = await import(
  "../../src/lib/reporting/figure-history.ts"
);
const { monthsEndingAt } = await import("../../src/lib/reporting/months.ts");
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { saveOffer, saveOfferMonth } = await import("../../src/lib/reporting/offer-actions.ts");
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
  await save("financials", month, {
    financials_fixed_costs: 300,
    financials_variable_costs: 250 * scale,
    financials_team_costs: 500,
    financials_other_income: 100 * scale,
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

for (const [month, revenue] of [
  [JUL, 3000],
  [AUG, 4500],
  [SEP, 6000],
]) {
  await as(NINA, () =>
    saveOfferMonth(
      null,
      form({
        workspace_id: WS,
        month,
        [`v:offers_units_sold:${offerId}`]: 6,
        [`v:offers_revenue_this_month:${offerId}`]: revenue,
        [`v:offers_hours_spent_delivering:${offerId}`]: 28,
        [`v:offers_other_direct_costs:${offerId}`]: 200,
      }),
    ),
  );
}

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
  assert.ok(financials.includes("financials_fixed_costs"));
  assert.ok(financials.includes("financials_other_income"));
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
