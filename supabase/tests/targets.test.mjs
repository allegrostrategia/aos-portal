/**
 * Targets (§7): standing, monthly, and which wins.
 *
 * "A target can be one monthly figure or change by month" — so a target
 * set for a month beats the standing one for that month and leaves every
 * other month alone. The precedence lives in `getTargets`; this drives
 * the screen's action against it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveTargets } = await import("../../src/lib/reporting/target-actions.ts");
const { getTargets } = await import("../../src/lib/reporting/queries.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const AUG = "2026-08-01";
const SEP = "2026-09-01";
const KEY = "leads_conversions_new_clients";

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
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${AUG}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
});

const as = (uid, fn) => {
  configure(db, uid);
  return fn();
};
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};
const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;

const save = (uid, month, fields) =>
  as(uid, () => saveTargets(null, form({ workspace_id: WS, month, ...fields })));

const targetFor = async (uid, month) => {
  configure(db, uid);
  return (await getTargets(WS, month)).get(`${KEY}|`) ?? null;
};

test("a standing target applies to every month", async () => {
  const result = await save(NINA, AUG, { [`target:${KEY}`]: 6, [`scope:${KEY}`]: "standing" });
  assert.equal(result?.error, undefined, result?.error);

  assert.equal(await targetFor(NINA, AUG), 6);
  assert.equal(await targetFor(NINA, SEP), 6, "including months nobody has opened");
});

test("a month's own target wins, and only for that month", async () => {
  const result = await save(NINA, SEP, { [`target:${KEY}`]: 9, [`scope:${KEY}`]: "month" });
  assert.equal(result?.error, undefined, result?.error);

  assert.equal(await targetFor(NINA, SEP), 9);
  assert.equal(await targetFor(NINA, AUG), 6, "August still has the standing one");

  const stored = await rows(`
    select month::text m, target_value::float v from public.report_targets
     where workspace_id = '${WS}' and metric_key = '${KEY}' order by month nulls first`);
  assert.deepEqual(stored.map((r) => [r.m, r.v]), [[null, 6], ["2026-09-01", 9]]);
});

test("clearing a box removes the target rather than setting it to nothing", async () => {
  const result = await save(NINA, SEP, { [`target:${KEY}`]: "", [`scope:${KEY}`]: "month" });
  assert.equal(result?.error, undefined, result?.error);

  assert.equal(await targetFor(NINA, SEP), 6, "back to the standing one");
  const stored = await rows(`
    select count(*)::int c from public.report_targets
     where workspace_id = '${WS}' and month is not null`);
  assert.equal(stored[0].c, 0, "and the row is gone, not zeroed");
});

test("a negative target is refused", async () => {
  const result = await save(NINA, AUG, { [`target:${KEY}`]: -5, [`scope:${KEY}`]: "standing" });
  assert.match(result?.error ?? "", /cannot be negative/);
  assert.equal(await targetFor(NINA, AUG), 6, "unchanged");
});

test("an unknown metric key is ignored rather than stored", async () => {
  const result = await save(NINA, AUG, {
    "target:not_a_metric": 10,
    "scope:not_a_metric": "standing",
  });
  assert.equal(result?.notice, "Nothing changed.");

  const stored = await rows(`
    select count(*)::int c from public.report_targets where metric_key = 'not_a_metric'`);
  assert.equal(stored[0].c, 0);
});

test("an assigned team member can set them; the client cannot", async () => {
  const elize = await save(ELIZE, AUG, {
    [`target:${KEY}`]: 7,
    [`scope:${KEY}`]: "standing",
  });
  assert.equal(elize?.error, undefined, elize?.error);
  assert.equal(await targetFor(NINA, AUG), 7);

  const refused = await save(CLIENT, AUG, {
    [`target:${KEY}`]: 999,
    [`scope:${KEY}`]: "standing",
  });
  assert.match(refused?.error ?? "", /set by your strategist/);
  assert.equal(await targetFor(NINA, AUG), 7, "and nothing of theirs was written");
});

test("the client can read the target that applies to them", async () => {
  // They cannot set one, but the bar on their Overview is drawn from it.
  assert.equal(await targetFor(CLIENT, AUG), 7);
});

/**
 * A target per platform, per offer, per campaign (Nina, 11 November).
 *
 * **The storage was always there** — `report_targets.entity_id` has had
 * a foreign key and a unique index per (workspace, metric, entity,
 * month) since 30 September. What was missing was a screen that could
 * write one, and the screen's filter (`entity_type === null`) meant no
 * Social Media figure could be given a target by anybody, since every
 * one of them hangs off a platform.
 *
 * These drive the real action, because the thing worth proving is that
 * two platforms keep two separate targets rather than overwriting each
 * other — which is what a single `metric_key` key would have done.
 */
const POSTS = "social_media_posts_published";

let IG;
let LI;
let OFFER;
await asMember(db, NINA, async () => {
  const made = await db.query(
    `insert into public.report_entities (workspace_id, entity_type, name, sort_order)
     values ('${WS}', 'social_platform', 'Instagram', 1),
            ('${WS}', 'social_platform', 'LinkedIn', 2),
            ('${WS}', 'offer', 'Signature programme', 1)
     returning id, name`,
  );
  IG = made.rows.find((r) => r.name === "Instagram").id;
  LI = made.rows.find((r) => r.name === "LinkedIn").id;
  OFFER = made.rows.find((r) => r.name === "Signature programme").id;
});

test("two platforms keep two targets for the same figure", async () => {
  const result = await save(NINA, SEP, {
    [`target:${POSTS}:${IG}`]: 20,
    [`scope:${POSTS}:${IG}`]: "standing",
    [`target:${POSTS}:${LI}`]: 12,
    [`scope:${POSTS}:${LI}`]: "standing",
  });
  assert.equal(result?.error, undefined, result?.error);

  configure(db, NINA);
  const targets = await getTargets(WS, SEP);
  assert.equal(targets.get(`${POSTS}|${IG}`), 20);
  assert.equal(targets.get(`${POSTS}|${LI}`), 12, "not overwritten by Instagram's");
  assert.equal(targets.get(`${POSTS}|`), undefined, "and no month-level one was invented");
});

test("a platform's target can be for one month only, like any other", async () => {
  const result = await save(NINA, SEP, {
    [`target:${POSTS}:${LI}`]: 15,
    [`scope:${POSTS}:${LI}`]: "month",
  });
  assert.equal(result?.error, undefined, result?.error);

  configure(db, NINA);
  assert.equal((await getTargets(WS, SEP)).get(`${POSTS}|${LI}`), 15, "September's own");
  assert.equal((await getTargets(WS, AUG)).get(`${POSTS}|${LI}`), 12, "August keeps the standing one");
});

test("clearing one platform's target leaves the other alone", async () => {
  const result = await save(NINA, SEP, {
    [`target:${POSTS}:${IG}`]: "",
    [`scope:${POSTS}:${IG}`]: "standing",
  });
  assert.equal(result?.error, undefined, result?.error);

  configure(db, NINA);
  const targets = await getTargets(WS, SEP);
  assert.equal(targets.get(`${POSTS}|${IG}`), undefined, "gone");
  assert.equal(targets.get(`${POSTS}|${LI}`), 15, "LinkedIn's is untouched");
});

test("the same machinery holds an offer's target", async () => {
  // Nina asked for platforms; Dom asked for offers and campaigns on the
  // same machinery. There is nothing platform-shaped in the action, so
  // this is the test that says so.
  const result = await save(NINA, SEP, {
    [`target:offers_units_sold:${OFFER}`]: 8,
    [`scope:offers_units_sold:${OFFER}`]: "standing",
  });
  assert.equal(result?.error, undefined, result?.error);

  configure(db, NINA);
  assert.equal((await getTargets(WS, SEP)).get(`offers_units_sold|${OFFER}`), 8);
});

test("a target against another client's row is ignored, not written", async () => {
  // The database would refuse it anyway — `report_targets.workspace_id`
  // and the entity's own workspace are both in the policy — but the form
  // is not the only way in, and ignoring the field keeps the rest of a
  // perfectly good save working.
  let theirs;
  await asMember(db, NINA, async () => {
    const other = (
      await db.query(`select (public.create_report_workspace(
        '${CLIENT}', 'retainer', 'Somebody Else', 'Bella Test', '${AUG}')).id as id`)
    ).rows[0].id;
    theirs = (
      await db.query(`insert into public.report_entities (workspace_id, entity_type, name)
                      values ('${other}', 'social_platform', 'Instagram') returning id`)
    ).rows[0].id;
  });

  const result = await save(NINA, SEP, { [`target:${POSTS}:${theirs}`]: 99 });
  assert.equal(result?.notice, "Nothing changed.");

  const written = await rows(
    `select count(*)::int c from public.report_targets where entity_id = '${theirs}'`,
  );
  assert.equal(written[0].c, 0);
});
