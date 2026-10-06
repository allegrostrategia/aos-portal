/**
 * The entry card, the admin report and the client report say the same thing.
 *
 * §9's rule, and the one this codebase has broken most often. Every
 * instance so far was the same shape — one screen worked a figure out and
 * another read it from somewhere else:
 *
 *   · the Financials entry card showed dashes where the report showed real
 *     figures, because it called calculate() without the offers;
 *   · Revenue and Profit said "No month to compare" because last month's
 *     offers were never worked out;
 *   · "Still to fill in" read 0/3 because completion used a month-level
 *     lookup and Offers stores per offer.
 *
 * Each was found by a person looking at a screen. This asserts it instead,
 * for every category and both readers, by computing what each surface
 * would render and comparing. It is not a substitute for the browser
 * tests — it cannot see a layout — but it catches the disagreement itself,
 * which is the part that is wrong rather than ugly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { resolveReportContext } = await import("../../src/lib/reporting/context.ts");
const { getMonthFigures } = await import("../../src/lib/reporting/month-figures.ts");
const { calculate } = await import("../../src/lib/reporting/calculate.ts");
const { CATEGORIES } = await import("../../src/lib/reporting/categories.ts");
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { saveOffer, saveOfferMonth } = await import("../../src/lib/reporting/offer-actions.ts");
const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
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
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${AUG}')).id as id`),
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

// A month with something in every Stage 2 category, plus an offer, so the
// comparison below has figures to disagree about.
await save("client_experience", AUG, {
  client_experience_clients_at_start_opening: 10,
  client_experience_clients_who_left: 1,
  client_experience_renewals_and_upsells: 2,
  client_experience_issues_raised: 1,
});
await save("leads_conversions", AUG, {
  leads_conversions_new_leads_from_social: 12,
  leads_conversions_new_leads_from_email: 6,
  leads_conversions_calls_booked: 10,
  leads_conversions_calls_held: 8,
  leads_conversions_new_clients: 4,
});
await save("social_media", AUG, {
  social_media_followers_at_month_end: 1100,
  social_media_reach: 30000,
  social_media_likes_plus_comments: 900,
  social_media_saves: 120,
  social_media_shares: 60,
  social_media_posts_published: 12,
});
await save("financials", AUG, {
  financials_fixed_costs: 300,
  financials_variable_costs: 250,
  financials_team_costs: 500,
  financials_cash_in_bank_at_month_end: 6500,
});

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

await as(NINA, () =>
  saveOfferMonth(
    null,
    form({
      workspace_id: WS,
      month: AUG,
      // "v:<metric>:<offer id>" — the shape the Offers screen posts.
      [`v:offers_units_sold:${offerId}`]: 6,
      [`v:offers_revenue_this_month:${offerId}`]: 3000,
      [`v:offers_hours_spent_delivering:${offerId}`]: 28,
      [`v:offers_other_direct_costs:${offerId}`]: 200,
    }),
  ),
);

/**
 * What the entry screen's live card would show for a category.
 *
 * The same call the client component makes: `calculate()` over the typed
 * values, with the offers and the opening figure passed in. If this and
 * the report ever differ, one of the two is lying to whoever is reading it.
 */
function entryCard(figures, category) {
  // Read the way the entry screen reads, which is not the way the
  // database holds it. Two differences, and both have been bugs:
  //
  //   · Social Media's figures hang off a platform entity, so a
  //     month-level read finds nothing (fixed 6 Oct);
  //   · the screen has boxes for its own category only, so a figure from
  //     another one arrives through the page's `elsewhere` map — month
  //     level and typed. Before that existed, the card showed a dash for
  //     "new clients" and an "active clients at end" that ignored them.
  const platformId =
    figures.data.entities.find((e) => e.entity_type === "social_platform")?.id ?? null;
  const entityFor = (metricKey) =>
    figures.byKey.get(metricKey)?.entity_type === "social_platform" ? platformId : null;

  const ownBox = new Set(
    figures.metrics
      .filter((m) => m.category === category)
      .filter((m) => m.input_type === "core" || m.input_type === "optional")
      .map((m) => m.key),
  );
  const elsewhere = new Set(
    figures.metrics
      .filter((m) => m.category !== category && m.entity_type === null)
      .filter((m) => m.input_type === "core" || m.input_type === "optional")
      .map((m) => m.key),
  );

  const value = (key) => {
    if (ownBox.has(key)) return figures.data.values.get(key, entityFor(key)) ?? null;
    if (elsewhere.has(key)) return figures.data.values.get(key) ?? null;
    // Anything else the card genuinely cannot see: derived, or per-entity
    // and belonging to another screen.
    return null;
  };

  return calculate(category, {
    value,
    previous: (key) => figures.data.previous.get(key, entityFor(key)) ?? null,
    offerRows: figures.offerRows,
    clientsAtStart: figures.results.client_experience_active_clients_at_start ?? null,
  });
}

test("the entry card and the report agree, in every category", async () => {
  configure(db, NINA);
  const ctx = await resolveReportContext({ workspace: WS, month: "2026-08" }, "2026-09-02");
  const figures = await getMonthFigures(ctx);

  const disagreements = [];
  for (const category of CATEGORIES) {
    const card = entryCard(figures, category.key);
    for (const [key, cardValue] of Object.entries(card)) {
      const reportValue = figures.figure(key);
      if (cardValue !== reportValue) {
        disagreements.push(`${key}: entry card ${cardValue}, report ${reportValue}`);
      }
    }
  }

  assert.deepEqual(disagreements, [], "§9: these two must never disagree");
});

test("the card is not agreeing by being empty", async () => {
  // The positive control. A comparison of two sets of dashes passes
  // happily and proves nothing, which is how three of these bugs survived.
  configure(db, NINA);
  const ctx = await resolveReportContext({ workspace: WS, month: "2026-08" }, "2026-09-02");
  const figures = await getMonthFigures(ctx);

  const card = entryCard(figures, "financials");
  const real = Object.values(card).filter((v) => v !== null);
  assert.ok(real.length >= 4, `expected real figures, got ${JSON.stringify(card)}`);
  assert.equal(card.financials_total_revenue, 3000, "pulled from the offers, not typed");
  assert.equal(card.financials_profit, 1950);
});

test("the client's report matches the admin's, figure for figure", async () => {
  await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: AUG })));

  configure(db, NINA);
  const adminCtx = await resolveReportContext({ workspace: WS, month: "2026-08" }, "2026-09-02");
  const admin = await getMonthFigures(adminCtx);

  configure(db, CLIENT);
  const clientCtx = await resolveReportContext({ workspace: WS, month: "2026-08" }, "2026-09-02");
  const client = await getMonthFigures(clientCtx);

  const keys = [...new Set([...Object.keys(admin.results), ...Object.keys(client.results)])];
  const differences = keys
    .map((key) => ({ key, a: admin.figure(key), c: client.figure(key) }))
    .filter(({ a, c }) => a !== c);

  assert.deepEqual(
    differences.map((d) => `${d.key}: admin ${d.a}, client ${d.c}`),
    [],
    "a published month reads the same to both of them",
  );

  // Positive control again: they are agreeing about real numbers.
  assert.equal(admin.figure("financials_profit"), 1950);
  assert.equal(client.figure("financials_profit"), 1950);
  assert.equal(client.figure("client_experience_retention_rate"), 90, "(10 − 1) ÷ 10");
});

test("an unpublished month is not readable to the client at all", async () => {
  await save("financials", SEP, { financials_fixed_costs: 999 });

  configure(db, CLIENT);
  const ctx = await resolveReportContext({ workspace: WS, month: "2026-09" }, "2026-10-02");

  assert.equal(ctx.monthPublished, false, "and the page says so rather than showing figures");
  const client = await getMonthFigures(ctx);
  assert.equal(
    client.figure("financials_fixed_costs"),
    null,
    "a draft month's figures are not hidden by the screen — they are unreadable",
  );
});
