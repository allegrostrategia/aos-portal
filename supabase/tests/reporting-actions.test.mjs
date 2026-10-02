/**
 * The reporting month, driven through the app's own Server Actions.
 *
 * This is the walkthrough Dom would otherwise do by hand — set up a retainer
 * client, enter offers, enter the other four categories, publish, and check
 * what the client can see at each point — run against a real Postgres with
 * the real policies, as the real people.
 *
 * It exists because the parts that fail quietly here are the parts a
 * click-through is worst at catching: a figure saved against the wrong
 * entity, a draft month readable a moment too early, a second save
 * duplicating a row instead of updating it. None of those look wrong on
 * screen.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.test";

const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { saveOffer, saveOfferMonth } = await import("../../src/lib/reporting/offer-actions.ts");
const { saveStrategistNote, publishMonth, unpublishMonth } =
  await import("../../src/lib/reporting/note-actions.ts");
const { saveWorkspaceSettings } = await import("../../src/lib/admin/report-users.ts");
const { calculate } = await import("../../src/lib/reporting/calculate.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const AUG = "2026-08-01";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

const WS = (
  await asMember(db, NINA, () =>
    db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Bella Rossi Coaching', 'Bella Rossi', '${AUG}')).id as id`),
  )
).rows[0].id;

/** Run an action as a given signed-in person. */
const as = (uid, fn) => {
  configure(db, uid);
  return fn();
};

const form = (fields) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
  return data;
};

/** Read straight from the database as that person, so RLS is what answers. */
const rows = async (uid, sql) => (await asMember(db, uid, () => db.query(sql))).rows;
const count = async (uid, sql) => Number((await rows(uid, sql))[0].c);

// ---------------------------------------------------------------------------
test("the client's workspace is created with them already granted", async () => {
  assert.equal(
    await count(NINA, `select count(*)::int c from public.report_access
      where workspace_id = '${WS}' and user_id = '${CLIENT}' and role = 'client'`),
    1,
  );
});

// ---------------------------------------------------------------------------
test("Offers: setting one up, then entering its month", async () => {
  const added = await as(NINA, () =>
    saveOffer(null, form({
      workspace_id: WS, name: "1:1 Coaching Package",
      price: "2500", pricing_model: "one_off", hourly_cost: "60",
    })),
  );
  assert.equal(added?.error, undefined, added?.error);

  const [offer] = await rows(NINA,
    `select id from public.report_entities where workspace_id = '${WS}' and entity_type = 'offer'`);
  assert.ok(offer, "the offer exists");

  const saved = await as(NINA, () =>
    saveOfferMonth(null, form({
      workspace_id: WS, month: AUG,
      [`v:offers_units_sold:${offer.id}`]: "4",
      [`v:offers_revenue_this_month:${offer.id}`]: "10000",
      [`v:offers_hours_spent_delivering:${offer.id}`]: "20",
    })),
  );
  assert.equal(saved?.error, undefined, saved?.error);

  // Against the offer, not the month — the thing a screen cannot show you.
  const stored = await rows(NINA, `
    select metric_key, entity_id, value::float v from public.report_values
    where workspace_id = '${WS}' and month = '${AUG}' and metric_key like 'offers_%'`);
  assert.equal(stored.length, 3);
  assert.ok(stored.every((r) => r.entity_id === offer.id), "every figure hangs off the offer");
});

// ---------------------------------------------------------------------------
test("saving the same month twice updates rather than duplicating", async () => {
  const [offer] = await rows(NINA,
    `select id from public.report_entities where workspace_id = '${WS}' and entity_type = 'offer'`);

  const again = await as(NINA, () =>
    saveOfferMonth(null, form({
      workspace_id: WS, month: AUG,
      [`v:offers_units_sold:${offer.id}`]: "5",
      [`v:offers_revenue_this_month:${offer.id}`]: "12500",
      [`v:offers_hours_spent_delivering:${offer.id}`]: "20",
    })),
  );
  assert.equal(again?.error, undefined, again?.error);
  assert.match(again?.notice ?? "", /Saved/);

  const stored = await rows(NINA, `
    select value::float v from public.report_values
    where workspace_id = '${WS}' and month = '${AUG}' and metric_key = 'offers_units_sold'`);
  assert.equal(stored.length, 1, "one row, not two");
  assert.equal(stored[0].v, 5, "and it holds the corrected figure");
});

// ---------------------------------------------------------------------------
test("the other four categories save, and Social Media gets its platform", async () => {
  const entries = {
    social_media: {
      social_media_followers_at_month_end: 26420, social_media_posts_published: 22,
      social_media_reach: 184500, social_media_views: 412600,
      social_media_likes_plus_comments: 12640, social_media_saves: 3120,
      social_media_shares: 1480,
    },
    email: {
      email_list_size_at_month_end: 8742, email_new_subscribers: 420,
      email_unsubscribes: 64, email_emails_sent: 12,
      email_average_open_rate: 42, email_average_click_rate: 3.2,
    },
    leads_conversions: {
      leads_conversions_new_leads_from_social: 120,
      leads_conversions_new_leads_from_email: 86,
      leads_conversions_new_leads_from_referral: 28,
      leads_conversions_calls_booked: 46, leads_conversions_calls_held: 34,
      leads_conversions_new_clients: 14,
    },
    financials: {
      financials_fixed_costs: 3200, financials_variable_costs: 6100,
      financials_team_costs: 4230, financials_cash_in_bank_at_month_end: 41000,
    },
  };

  for (const [category, fields] of Object.entries(entries)) {
    const body = { workspace_id: WS, month: AUG, category };
    for (const [key, value] of Object.entries(fields)) body[`v:${key}`] = value;
    const result = await as(NINA, () => saveCategoryValues(null, form(body)));
    assert.equal(result?.error, undefined, `${category}: ${result?.error}`);
  }

  // §5.2 stores social figures per platform, created on first save, so the
  // second platform later is a new row and not a backfill of everything.
  const platforms = await rows(NINA, `
    select name from public.report_entities
    where workspace_id = '${WS}' and entity_type = 'social_platform'`);
  assert.deepEqual(platforms.map((p) => p.name), ["Instagram"]);

  const social = await rows(NINA, `
    select entity_id from public.report_values
    where workspace_id = '${WS}' and month = '${AUG}' and metric_key = 'social_media_reach'`);
  assert.ok(social[0].entity_id, "social figures hang off the platform");
});

// ---------------------------------------------------------------------------
test("the Overview's headline figures come out right", async () => {
  const stored = await rows(NINA, `
    select metric_key, value::float v from public.report_values
    where workspace_id = '${WS}' and month = '${AUG}'`);
  const byKey = new Map(stored.map((r) => [r.metric_key, r.v]));

  const offerRows = [{
    name: "1:1 Coaching Package", hourlyCost: 60, pricingModel: "one_off",
    unitsSold: byKey.get("offers_units_sold"),
    revenue: byKey.get("offers_revenue_this_month"),
    hoursSpent: byKey.get("offers_hours_spent_delivering"),
  }];

  const value = (key) => byKey.get(key) ?? null;
  const fin = calculate("financials", { value, previous: () => null, offerRows });
  const leads = calculate("leads_conversions", { value, previous: () => null });

  // Revenue is PULLED from the offers — the bug that had both of these
  // showing a dash on a month with offers entered.
  assert.equal(fin.financials_total_revenue, 12500);
  assert.equal(fin.financials_profit, 12500 - 13530);
  assert.equal(leads.leads_conversions_total_leads, 234);
});

// ---------------------------------------------------------------------------
test("a draft month is invisible to the client, at the database", async () => {
  assert.equal(
    await count(CLIENT, `select count(*)::int c from public.report_values where workspace_id = '${WS}'`),
    0,
  );
});

test("the client cannot enter their own figures", async () => {
  const refused = await as(CLIENT, () =>
    saveCategoryValues(null, form({
      workspace_id: WS, month: AUG, category: "email",
      "v:email_new_subscribers": "9999",
    })),
  );
  assert.match(refused?.error ?? "", /filled in by your strategist/);

  assert.equal(
    await count(NINA, `select count(*)::int c from public.report_values
      where workspace_id = '${WS}' and metric_key = 'email_new_subscribers' and value = 9999`),
    0,
    "and nothing was written",
  );
});

test("the client cannot publish their own month", async () => {
  const refused = await as(CLIENT, () =>
    publishMonth(null, form({ workspace_id: WS, month: AUG })),
  );
  assert.match(refused?.error ?? "", /Only Nina can publish/);
});

// ---------------------------------------------------------------------------
test("a strategist note is unreadable to the client until the month is out", async () => {
  const written = await as(NINA, () =>
    saveStrategistNote(null, form({
      workspace_id: WS, month: AUG, category: "",
      body: "A strong month. Relaunch the ad campaign in week 2.",
    })),
  );
  assert.equal(written?.error, undefined, written?.error);

  assert.equal(
    await count(CLIENT, `select count(*)::int c from public.report_notes where workspace_id = '${WS}'`),
    0,
    "§13: unreadable at database level, not merely unrendered",
  );
});

// ---------------------------------------------------------------------------
test("Nina publishes, and the whole month appears for the client at once", async () => {
  const published = await as(NINA, () =>
    publishMonth(null, form({ workspace_id: WS, month: AUG })),
  );
  assert.equal(published?.error, undefined, published?.error);

  assert.ok(
    (await count(CLIENT, `select count(*)::int c from public.report_values where workspace_id = '${WS}'`)) > 0,
    "figures",
  );
  assert.equal(
    await count(CLIENT, `select count(*)::int c from public.report_notes where workspace_id = '${WS}'`),
    1,
    "and the note",
  );
});

test("taking it back to draft hides it again", async () => {
  await as(NINA, () => unpublishMonth(null, form({ workspace_id: WS, month: AUG })));
  assert.equal(
    await count(CLIENT, `select count(*)::int c from public.report_values where workspace_id = '${WS}'`),
    0,
  );
  // Put it back, so the second month's test starts from a published August.
  await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: AUG })));
});

// ---------------------------------------------------------------------------
test("a second month stands on its own, and does not publish itself", async () => {
  const result = await as(NINA, () =>
    saveCategoryValues(null, form({
      workspace_id: WS, month: SEP, category: "email",
      "v:email_list_size_at_month_end": "9100",
      "v:email_new_subscribers": "430",
      "v:email_unsubscribes": "58",
      "v:email_emails_sent": "14",
      "v:email_average_open_rate": "44",
      "v:email_average_click_rate": "3.6",
    })),
  );
  assert.equal(result?.error, undefined, result?.error);

  // August is published; September is not, and publishing one must not
  // release the other.
  assert.equal(
    await count(CLIENT, `select count(*)::int c from public.report_values
      where workspace_id = '${WS}' and month = '${SEP}'`),
    0,
  );
  assert.ok(
    (await count(CLIENT, `select count(*)::int c from public.report_values
      where workspace_id = '${WS}' and month = '${AUG}'`)) > 0,
  );
});

test("September's figures can be compared against August's", async () => {
  // What the entry screen's "August: 8,742" hint and every arrow rely on.
  const [aug] = await rows(NINA, `select value::float v from public.report_values
    where workspace_id = '${WS}' and month = '${AUG}' and metric_key = 'email_list_size_at_month_end'`);
  const [sep] = await rows(NINA, `select value::float v from public.report_values
    where workspace_id = '${WS}' and month = '${SEP}' and metric_key = 'email_list_size_at_month_end'`);

  assert.equal(aug.v, 8742);
  assert.equal(sep.v, 9100);

  const growth = calculate("email", {
    value: (k) => (k === "email_list_size_at_month_end" ? sep.v : null),
    previous: (k) => (k === "email_list_size_at_month_end" ? aug.v : null),
  });
  assert.equal(growth.email_net_list_growth, 358);
});

// ---------------------------------------------------------------------------
// Correcting a client's details.
//
// These drive the real action, not a copy of its rule. The first version of
// this had a unit test over a re-implementation of the comparison, which
// would have passed happily with the guard deleted — exactly the shape the
// standing rule about proving a test can fail is there to catch.
// ---------------------------------------------------------------------------

test("the first month can be moved earlier, which only widens the picker", async () => {
  const result = await as(NINA, () =>
    saveWorkspaceSettings(null, form({
      workspace_id: WS, business_name: "Bella Rossi Coaching",
      currency: "GBP", first_month: "2026-07",
    })),
  );
  assert.equal(result?.error, undefined, result?.error);

  const [ws] = await rows(NINA,
    `select first_month::text m from public.report_workspaces where id = '${WS}'`);
  assert.equal(ws.m, "2026-07-01");
});

test("moving it past existing figures is refused, and nothing changes", async () => {
  // August and September both hold figures by now, and August is published.
  const result = await as(NINA, () =>
    saveWorkspaceSettings(null, form({
      workspace_id: WS, business_name: "Renamed In The Attempt",
      currency: "USD", first_month: "2026-09",
    })),
  );

  assert.match(result?.error ?? "", /already/);
  assert.match(result?.error ?? "", /2026-08/, "it names the month in the way");

  const [ws] = await rows(NINA, `
    select first_month::text m, business_name, currency
    from public.report_workspaces where id = '${WS}'`);
  assert.equal(ws.m, "2026-07-01", "first month untouched");
  assert.equal(ws.business_name, "Bella Rossi Coaching", "and so is everything else");
  assert.equal(ws.currency, "GBP");
});

test("a month with only a note in it still blocks the move", async () => {
  // report_values is not the only table keyed by month. Checking it alone
  // would let a note, a published period or a Trial Reels list be stranded.
  const JUL = "2026-07-01";
  await as(NINA, () =>
    saveStrategistNote(null, form({
      workspace_id: WS, month: JUL, category: "",
      body: "July, which has a note and no figures.",
    })),
  );

  const result = await as(NINA, () =>
    saveWorkspaceSettings(null, form({
      workspace_id: WS, business_name: "Bella Rossi Coaching",
      currency: "GBP", first_month: "2026-08",
    })),
  );

  assert.match(result?.error ?? "", /2026-07/, "names July, which only has a note");
  assert.match(result?.error ?? "", /note/);
});

test("a workspace id that matches nothing does not report success", async () => {
  const result = await as(NINA, () =>
    saveWorkspaceSettings(null, form({
      workspace_id: "00000000-0000-0000-0000-00000000dead",
      business_name: "Ghost Ltd", currency: "GBP", first_month: "2026-01",
    })),
  );
  assert.match(result?.error ?? "", /could not be found/);
  assert.equal(result?.notice, undefined, "and it certainly does not say 'updated'");
});

test("only an admin can correct a client's details", async () => {
  await assert.rejects(
    () => as(CLIENT, () =>
      saveWorkspaceSettings(null, form({
        workspace_id: WS, business_name: "Mine Now",
        currency: "GBP", first_month: "2026-01",
      })),
    ),
    /REDIRECT/,
    "requireAdmin() redirects rather than returning an error",
  );

  const [ws] = await rows(NINA,
    `select business_name from public.report_workspaces where id = '${WS}'`);
  assert.equal(ws.business_name, "Bella Rossi Coaching");
});

test("the currency has to look like a currency", async () => {
  const result = await as(NINA, () =>
    saveWorkspaceSettings(null, form({
      workspace_id: WS, business_name: "Bella Rossi Coaching",
      currency: "pounds", first_month: "2026-07",
    })),
  );
  assert.match(result?.error ?? "", /three-letter code/);
});

test("a read that fails stops the save rather than passing the guard", async () => {
  // Fault injection, because there is no other way to make one of the four
  // checks error. Without the error branch, a failed read looks exactly
  // like "nothing in the way" and the whole guard becomes decorative —
  // which is what the first version of this action did.
  await db.exec(`alter table public.report_top_items rename column month to month_renamed`);
  try {
    const result = await as(NINA, () =>
      saveWorkspaceSettings(null, form({
        workspace_id: WS, business_name: "Bella Rossi Coaching",
        currency: "GBP", first_month: "2026-09",
      })),
    );
    assert.match(result?.error ?? "", /Couldn't check report_top_items/);
    assert.equal(result?.notice, undefined);
  } finally {
    await db.exec(`alter table public.report_top_items rename column month_renamed to month`);
  }

  const [ws] = await rows(NINA,
    `select first_month::text m from public.report_workspaces where id = '${WS}'`);
  assert.equal(ws.m, "2026-07-01", "and nothing was saved");
});
