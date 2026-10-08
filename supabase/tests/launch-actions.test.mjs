/**
 * Setting a launch up and typing its figures in (§6.1–6.5).
 *
 * Driven through the app's own actions as the real people, against the
 * real access rules: Nina, an assigned team member, and the client who
 * may touch none of it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const {
  createLaunch,
  updateLaunch,
  updateLaunchStatus,
  saveStages,
  savePrices,
  saveLaunchFigures,
  publishLaunch,
  unpublishLaunch,
} = await import("../../src/lib/reporting/launch-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const AUG = "2026-08-01";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
await asMember(db, NINA, async () => {
  WS = (await db.query(`select (public.create_report_workspace(
    '${CLIENT}','retainer','Northwind Studio','Bella Test','${AUG}')).id as id`)).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
});

const as = (uid, fn) => { configure(db, uid); return fn(); };
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};
const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;

let LAUNCH;

test("Elize creates a launch, and it redirects her to set it up", async () => {
  // `createLaunch` ends in a redirect, which the stub throws.
  await assert.rejects(
    () => as(ELIZE, () => createLaunch(null, form({
      workspace_id: WS, name: "Autumn challenge",
      description: "Five days, then the masterclass",
      goal_good: 30, goal_better: 45, goal_best: 60,
      planner_show_up_rate: 47, planner_conversion_rate: 5,
    }))),
    /NEXT_REDIRECT|redirect/i,
  );

  const [row] = await rows(`select id, name, goal_good from public.report_launches`);
  LAUNCH = row.id;
  assert.equal(row.name, "Autumn challenge");
  assert.equal(row.goal_good, 30);
});

test("the goals have to go up, and it says so in her words", async () => {
  const result = await as(ELIZE, () => updateLaunch(null, form({
    launch_id: LAUNCH, name: "Autumn challenge",
    goal_good: 60, goal_better: 45, goal_best: 30,
  })));
  assert.match(result?.error ?? "", /go up in that order/);
});

test("two launches cannot share a name, said as a name and not an index", async () => {
  const result = await as(ELIZE, () => createLaunch(null, form({
    workspace_id: WS, name: "Autumn challenge",
  })));
  assert.match(result?.error ?? "", /already a launch called "Autumn challenge"/);
});

test("the client cannot create one at all", async () => {
  const result = await as(CLIENT, () => createLaunch(null, form({
    workspace_id: WS, name: "Mine",
  })));
  assert.ok(result?.error, "refused");
  const [count] = await rows(`select count(*)::int c from public.report_launches`);
  assert.equal(count.c, 1);
});

test("the stages save in one go, with one of them the selling stage", async () => {
  const result = await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH,
    main_stage: 2,
    "stage:1:name": "Five day challenge", "stage:1:type": "challenge",
    "stage:1:live_days": 5, "stage:1:sign_up_goal": 1277,
    "stage:1:promo_start": "2026-09-01", "stage:1:promo_end": "2026-09-13",
    "stage:2:name": "The masterclass", "stage:2:type": "masterclass",
    "stage:2:live_days": 1,
  })));
  assert.equal(result?.error, undefined, result?.error);

  const stages = await rows(`select position, name, is_main_selling_stage m
                               from public.report_launch_stages
                              where launch_id = '${LAUNCH}' order by position`);
  assert.deepEqual(stages.map((s) => s.name), ["Five day challenge", "The masterclass"]);
  assert.deepEqual(stages.map((s) => s.m), [false, true]);
});

test("moving the selling stage does not trip the one-per-launch rule", async () => {
  // The old one has to be cleared before the new one is set, or the
  // unique index refuses it. Worth a test precisely because the right
  // order looks like an implementation detail until it is wrong.
  const result = await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH,
    main_stage: 1,
    "stage:1:name": "Five day challenge", "stage:1:type": "challenge", "stage:1:live_days": 5,
    "stage:2:name": "The masterclass", "stage:2:type": "masterclass", "stage:2:live_days": 1,
  })));
  assert.equal(result?.error, undefined, result?.error);

  const stages = await rows(`select position, is_main_selling_stage m
                               from public.report_launch_stages
                              where launch_id = '${LAUNCH}' order by position`);
  assert.deepEqual(stages.map((s) => s.m), [true, false]);
});

test("a stage whose name is emptied is removed", async () => {
  await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH, main_stage: 1,
    "stage:1:name": "Five day challenge", "stage:1:type": "challenge", "stage:1:live_days": 5,
    "stage:2:name": "", "stage:2:type": "masterclass",
  })));
  const stages = await rows(
    `select count(*)::int c from public.report_launch_stages where launch_id = '${LAUNCH}'`);
  assert.equal(stages[0].c, 1);

  // Put it back for the figures below.
  await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH, main_stage: 2,
    "stage:1:name": "Five day challenge", "stage:1:type": "challenge", "stage:1:live_days": 5,
    "stage:2:name": "The masterclass", "stage:2:type": "masterclass", "stage:2:live_days": 1,
  })));
});

test("a stage that ends before it starts is refused, by name", async () => {
  const result = await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH, main_stage: 1,
    "stage:1:name": "Backwards", "stage:1:type": "webinar",
    "stage:1:live_start": "2026-09-20", "stage:1:live_end": "2026-09-01",
  })));
  assert.match(result?.error ?? "", /"Backwards" ends before it starts/);
});

test("the price options save, and one is the main one", async () => {
  const result = await as(ELIZE, () => savePrices(null, form({
    launch_id: LAUNCH, main_price: 1,
    "price:1:name": "Pay in full early bird", "price:1:price": 500, "price:1:id": "",
    "price:2:name": "Payment plan", "price:2:price": 600,
    "price:2:instalments": 3, "price:2:instalment_amount": 200, "price:2:id": "",
  })));
  assert.equal(result?.error, undefined, result?.error);

  const prices = await rows(`select name, price::float p, is_main m
                               from public.report_launch_prices
                              where launch_id = '${LAUNCH}' order by price`);
  assert.deepEqual(prices.map((r) => [r.name, r.p, r.m]), [
    ["Pay in full early bird", 500, true],
    ["Payment plan", 600, false],
  ]);
});

test("a price option with no price is refused, by name", async () => {
  const result = await as(ELIZE, () => savePrices(null, form({
    launch_id: LAUNCH, main_price: 1,
    "price:1:name": "Free somehow", "price:1:price": "", "price:1:id": "",
  })));
  assert.match(result?.error ?? "", /"Free somehow" needs a price/);
});

test("figures land in the context they were typed into", async () => {
  const [stage] = await rows(`select id from public.report_launch_stages
                               where launch_id = '${LAUNCH}' and position = 1`);
  const [price] = await rows(`select id from public.report_launch_prices
                               where launch_id = '${LAUNCH}' and is_main`);

  const result = await as(ELIZE, () => saveLaunchFigures(null, form({
    launch_id: LAUNCH,
    [`launch:launches_sign_ups:${stage.id}:-:-:-`]: 1277,
    [`launch:launches_live_attendees:${stage.id}:-:1:-`]: 600,
    [`launch:launches_live_attendees:${stage.id}:-:2:-`]: 540,
    [`launch:launches_email_open_rate:${stage.id}:-:-:1`]: 42,
    [`launch:launches_sales_per_price_option:-:${price.id}:-:-`]: 22,
    [`launch:launches_cash_collected_to_date:-:-:-:-`]: 12600,
  })));
  assert.equal(result?.error, undefined, result?.error);

  const stored = await rows(`select metric_key, coalesce(day_number, -1) d,
                                    coalesce(email_number, -1) e,
                                    (stage_id is not null) s, (price_id is not null) p,
                                    value::float v
                               from public.report_launch_values
                              where launch_id = '${LAUNCH}'
                              order by metric_key, d, e`);
  assert.deepEqual(stored.map((r) => [r.metric_key, r.d, r.e, r.s, r.p, r.v]), [
    ["launches_cash_collected_to_date", -1, -1, false, false, 12600],
    ["launches_email_open_rate", -1, 1, true, false, 42],
    ["launches_live_attendees", 1, -1, true, false, 600],
    ["launches_live_attendees", 2, -1, true, false, 540],
    ["launches_sales_per_price_option", -1, -1, false, true, 22],
    ["launches_sign_ups", -1, -1, true, false, 1277],
  ]);
});

test("an emptied figure is removed, not stored as zero", async () => {
  const [stage] = await rows(`select id from public.report_launch_stages
                               where launch_id = '${LAUNCH}' and position = 1`);
  await as(ELIZE, () => saveLaunchFigures(null, form({
    launch_id: LAUNCH,
    [`launch:launches_live_attendees:${stage.id}:-:2:-`]: "",
  })));
  const left = await rows(`select count(*)::int c from public.report_launch_values
                            where launch_id = '${LAUNCH}' and day_number = 2`);
  assert.equal(left[0].c, 0, "gone, so the chart shows a gap rather than a zero");
});

test("a figure that is not a launch metric is refused by the database", async () => {
  const result = await as(ELIZE, () => saveLaunchFigures(null, form({
    launch_id: LAUNCH,
    "launch:financials_fixed_costs:-:-:-:-": 100,
  })));
  assert.match(result?.error ?? "", /not a launch metric/i);
});

test("a worked-out figure cannot be typed in", async () => {
  // §9: a calc is worked out, never stored, or the stored one and the
  // worked one disagree the first time an input changes.
  const result = await as(ELIZE, () => saveLaunchFigures(null, form({
    launch_id: LAUNCH,
    "launch:launches_show_up_rate:-:-:-:-": 47,
  })));
  assert.match(result?.error ?? "", /worked out rather than stored/i);
});

test("a stage with figures on it refuses to go, and says what to do", async () => {
  // The restrict, from the editor's side. Removing a stage used to take
  // its sign-ups and its whole email sequence with it — silently, because
  // a foreign key cascade does not consult RLS or fire a policy.
  const result = await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH, main_stage: 2,
    "stage:1:name": "", "stage:1:type": "challenge",
    "stage:2:name": "The masterclass", "stage:2:type": "masterclass", "stage:2:live_days": 1,
  })));
  assert.match(result?.error ?? "", /Five day challenge\u201d has figures saved against it/);
  assert.match(result?.error ?? "", /Clear the figures first/);

  const stages = await rows(
    `select count(*)::int c from public.report_launch_stages where launch_id = '${LAUNCH}'`);
  assert.equal(stages[0].c, 2, "and it is still there");
});

test("cleared of its figures, the same stage goes", async () => {
  const [stage] = await rows(`select id from public.report_launch_stages
                               where launch_id = '${LAUNCH}' and position = 1`);
  const figures = await rows(`select metric_key, coalesce(day_number, -1) d,
                                     coalesce(email_number, -1) e
                                from public.report_launch_values
                               where stage_id = '${stage.id}'`);
  const cleared = {};
  for (const f of figures) {
    cleared[`launch:${f.metric_key}:${stage.id}:-:${f.d === -1 ? "-" : f.d}:${f.e === -1 ? "-" : f.e}`] = "";
  }
  await as(ELIZE, () => saveLaunchFigures(null, form({ launch_id: LAUNCH, ...cleared })));

  const result = await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH, main_stage: 2,
    "stage:1:name": "", "stage:1:type": "challenge",
    "stage:2:name": "The masterclass", "stage:2:type": "masterclass", "stage:2:live_days": 1,
  })));
  assert.equal(result?.error, undefined, result?.error);

  const stages = await rows(
    `select count(*)::int c from public.report_launch_stages where launch_id = '${LAUNCH}'`);
  assert.equal(stages[0].c, 1);

  // Put it back for the tests below.
  await as(ELIZE, () => saveStages(null, form({
    launch_id: LAUNCH, main_stage: 2,
    "stage:1:name": "Five day challenge", "stage:1:type": "challenge", "stage:1:live_days": 5,
    "stage:2:name": "The masterclass", "stage:2:type": "masterclass", "stage:2:live_days": 1,
  })));
});

test("a client cannot remove a launch's parts", async () => {
  const [stage] = await rows(`select id from public.report_launch_stages
                               where launch_id = '${LAUNCH}' limit 1`);
  const [price] = await rows(`select id from public.report_launch_prices
                               where launch_id = '${LAUNCH}' limit 1`);

  await asMember(db, CLIENT, async () => {
    for (const sql of [
      `delete from public.report_launch_stages where id = '${stage.id}'`,
      `delete from public.report_launch_prices where id = '${price.id}'`,
      `delete from public.report_launch_values where launch_id = '${LAUNCH}'`,
    ]) {
      const r = await db.query(sql);
      assert.equal(r.affectedRows ?? 0, 0, `a client removed something: ${sql}`);
    }
  });

  const left = await rows(`select
      (select count(*)::int from public.report_launch_stages where launch_id = '${LAUNCH}') s,
      (select count(*)::int from public.report_launch_prices where launch_id = '${LAUNCH}') p,
      (select count(*)::int from public.report_launch_values where launch_id = '${LAUNCH}') v`);
  assert.ok(left[0].s > 0 && left[0].p > 0 && left[0].v > 0, "all of it still there");
});

test("and the delete policies ask who may EDIT, which no behaviour can prove", async () => {
  // **A definition check, deliberately.** Loosening these three to
  // `using (true)` passes every behavioural test in this file, and that
  // is not a gap in the tests — it is true of the system. A client cannot
  // SELECT a draft launch's rows, so a delete matches nothing whatever
  // the policy says; once it is published the guard refuses everybody.
  // The policy is never the thing that decides.
  //
  // It should still ask the right question, because the two things
  // covering for it are a select policy and a trigger, and either could
  // be relaxed by somebody who checked that the tests still passed. So
  // this reads the rule itself rather than its effect.
  const policies = await rows(`
    select policyname, qual from pg_policies
     where tablename in ('report_launch_stages','report_launch_prices','report_launch_values')
       and cmd = 'DELETE' order by policyname`);

  assert.equal(policies.length, 3, "one per table");
  for (const policy of policies) {
    assert.match(
      policy.qual,
      /report_can_edit_launch/,
      `${policy.policyname} does not ask who may edit`,
    );
  }
});

test("once published, every one of these is refused", async () => {
  await asMember(db, NINA, () =>
    db.query(`update public.report_launches set published_at = now(), published_by = '${NINA}'
               where id = '${LAUNCH}'`));

  const [stage] = await rows(`select id from public.report_launch_stages
                               where launch_id = '${LAUNCH}' and position = 1`);
  const LOCKED = /launch report is published/i;

  assert.match(
    (await as(ELIZE, () => saveLaunchFigures(null, form({
      launch_id: LAUNCH,
      [`launch:launches_sign_ups:${stage.id}:-:-:-`]: 9999,
    }))))?.error ?? "", LOCKED);

  assert.match(
    (await as(ELIZE, () => savePrices(null, form({
      launch_id: LAUNCH, main_price: 1,
      "price:1:name": "Cheaper", "price:1:price": 100, "price:1:id": "",
    }))))?.error ?? "", LOCKED);

  assert.match(
    (await as(ELIZE, () => updateLaunch(null, form({
      launch_id: LAUNCH, name: "Renamed", goal_good: 30,
    }))))?.error ?? "", LOCKED);
});

test("publishing is Nina's, and taking it back too", async () => {
  await asMember(db, NINA, () =>
    db.query(`update public.report_launches set published_at = null, published_by = null
               where id = '${LAUNCH}'`));

  const refused = await as(ELIZE, () => publishLaunch(null, form({ launch_id: LAUNCH })));
  assert.match(refused?.error ?? "", /Only Nina can publish a launch report/);

  const published = await as(NINA, () => publishLaunch(null, form({ launch_id: LAUNCH })));
  assert.equal(published?.error, undefined, published?.error);
  assert.match(published?.notice ?? "", /The client can see this launch now/);
  // Decision 10: no email. The next monthly report is where it is
  // mentioned, which is one email a month rather than two.
  assert.doesNotMatch(published?.notice ?? "", /email/i);
});

test("publishing freezes the offer's name, which is all it carries from outside", async () => {
  // A launch's revenue comes from its OWN price options, so the one
  // thing that crosses the boundary is the label.
  let offer;
  await asMember(db, NINA, async () => {
    offer = (await db.query(`insert into public.report_entities
        (workspace_id, entity_type, name, active) values ('${WS}', 'offer', 'Signature programme', true)
      returning id`)).rows[0].id;
    await db.query(`update public.report_launches set published_at = null, published_by = null,
                      offer_entity_id = '${offer}' where id = '${LAUNCH}'`);
  });

  await as(NINA, () => publishLaunch(null, form({ launch_id: LAUNCH })));
  const [row] = await rows(`select carried->>'offerName' as n from public.report_launches
                             where id = '${LAUNCH}'`);
  assert.equal(row.n, "Signature programme");

  // Renamed afterwards, the published launch keeps what it went out with.
  await asMember(db, NINA, () =>
    db.query(`update public.report_entities set name = 'Something else' where id = '${offer}'`));
  const [after] = await rows(`select carried->>'offerName' as n from public.report_launches
                               where id = '${LAUNCH}'`);
  assert.equal(after.n, "Signature programme");
});

test("the status still moves on a published launch, and nothing else does", async () => {
  // Nina's decision 15, and the reason it needs its own action: a
  // disabled field does not submit, so the main form on a published
  // launch would carry a status and no name at all.
  const moved = await as(ELIZE, () =>
    updateLaunchStatus(null, form({ launch_id: LAUNCH, status: "completed" })));
  assert.equal(moved?.error, undefined, moved?.error);

  const [row] = await rows(`select status::text from public.report_launches where id = '${LAUNCH}'`);
  assert.equal(row.status, "completed");

  const refused = await as(ELIZE, () =>
    updateLaunch(null, form({ launch_id: LAUNCH, name: "Renamed", goal_good: 30 })));
  assert.match(refused?.error ?? "", /launch report is published/i);

  await as(NINA, () => unpublishLaunch(null, form({ launch_id: LAUNCH })));
});

test("the entry screen's box names are the names this parser reads", async () => {
  // Every other test in this file spells the field names out by hand, on
  // purpose: the parser should be held to the written contract rather
  // than to whatever the form happens to emit. This is the one place the
  // two are brought together, so a change to either is caught here
  // instead of showing up as a box that silently comes back empty —
  // which is precisely how it went wrong the first time, when the box
  // was named with `-` for "none" and its value looked up under `""`.
  const { launchFieldName } = await import("../../src/lib/reporting/launch-fields.ts");

  assert.equal(launchFieldName("launches_cash_collected_to_date"),
    "launch:launches_cash_collected_to_date:-:-:-:-");
  assert.equal(launchFieldName("launches_sign_ups", { stageId: "S" }),
    "launch:launches_sign_ups:S:-:-:-");
  assert.equal(launchFieldName("launches_live_attendees", { stageId: "S", day: 3 }),
    "launch:launches_live_attendees:S:-:3:-");
  assert.equal(launchFieldName("launches_email_open_rate", { stageId: "S", email: 2 }),
    "launch:launches_email_open_rate:S:-:-:2");
  assert.equal(launchFieldName("launches_sales_per_price_option", { priceId: "P" }),
    "launch:launches_sales_per_price_option:-:P:-:-");

  // And a figure saved under a built name comes back under the same one,
  // which is the round trip the screen actually depends on.
  const [stage] = await rows(`select id from public.report_launch_stages
                               where launch_id = '${LAUNCH}' and position = 1`);
  const name = launchFieldName("launches_replay_watchers", { stageId: stage.id });
  const result = await as(ELIZE, () => saveLaunchFigures(null, form({
    launch_id: LAUNCH,
    [name]: 310,
  })));
  assert.equal(result?.error, undefined, result?.error);

  const { getLaunch } = await import("../../src/lib/reporting/launch-queries.ts");
  const detail = await as(ELIZE, () => getLaunch(LAUNCH));
  assert.equal(detail.values.fields()[name], 310);
});
