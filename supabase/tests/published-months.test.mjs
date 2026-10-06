/**
 * What a published month still allows — a gap, written down.
 *
 * Dom asked, on 6 October, whether writes to `report_top_items` are
 * blocked on a published month, because a delete policy that was not
 * would let Elize remove a line from a report the client has already
 * received.
 *
 * **Nothing is blocked, on any of the month-keyed tables.** Every write
 * policy on `report_values`, `report_top_items` and `report_notes` asks
 * `report_can_edit(workspace_id)` and nothing else, and no trigger adds
 * a publish check. So a figure in a report the client read last week
 * can change today, and the client is told nothing.
 *
 * These tests **record that**, they do not endorse it. They are written
 * to fail the day somebody locks published months, which is the point:
 * whoever does it will see exactly which behaviours change and can
 * delete the ones that were never wanted.
 *
 * The two places that DO hold a published month still are both
 * deliberate and both narrow: the publish columns themselves
 * (guard_report_period_publish) and a funnel's captured price
 * (funnel-price.ts). Neither covers the figures.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { saveTopItems } = await import("../../src/lib/reporting/top-item-actions.ts");

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

test("the month is set up, filled in and published", async () => {
  await as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        category: "financials",
        "v:financials_fixed_costs": 300,
      }),
    ),
  );
  await as(NINA, () =>
    saveTopItems(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        "item:hook:1:body": "The one that worked",
        "item:hook:1:views": 40000,
      }),
    ),
  );
  const published = await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: AUG })));
  assert.equal(published?.error, undefined, published?.error);
});

test("GAP: an editor can change a figure on a published month", async () => {
  const result = await as(ELIZE, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        category: "financials",
        "v:financials_fixed_costs": 9999,
      }),
    ),
  );

  assert.equal(result?.error, undefined, "no error — the write is simply allowed");
  const [row] = await rows(`
    select value::float v from public.report_values
     where workspace_id = '${WS}' and month = '${AUG}'
       and metric_key = 'financials_fixed_costs'`);
  assert.equal(
    row.v,
    9999,
    "the client's August report now says something different from the one they read",
  );
});

test("GAP: an editor can rewrite a top-three line on a published month", async () => {
  const result = await as(ELIZE, () =>
    saveTopItems(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        "item:hook:1:body": "Something else entirely",
        "item:hook:1:views": 1,
      }),
    ),
  );

  assert.equal(result?.error, undefined);
  const [row] = await rows(`
    select body from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}' and item_type = 'hook' and rank = 1`);
  assert.equal(row.body, "Something else entirely");
});

test("GAP: and can clear it altogether, once the delete policy is on", async () => {
  // The question that started this, and the one test here that depends
  // on 20261006180000 — approved locally only, so this passes in the
  // harness (which runs every migration) and would fail against live
  // today, where clearing a line answers "it needs an admin" instead.
  //
  // A lock on insert and update would not catch this one: a delete is
  // its own policy and its own trigger event. That is the whole of
  // Dom's point — the two have to be done together or the lock leaks.
  const result = await as(ELIZE, () =>
    saveTopItems(null, form({ workspace_id: WS, month: AUG, "item:hook:1:body": "" })),
  );
  assert.equal(result?.error, undefined, result?.error);

  const remaining = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(remaining[0].c, 0);
});

test("what IS held: the publish columns, and nothing else on the period", async () => {
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () =>
        db.query(`
          update public.report_periods set published_at = null
           where workspace_id = '${WS}' and month = '${AUG}'`),
      /Only an admin can publish a report/,
      "unpublishing is Nina's",
    );
  });
});

test("the client still cannot write anything, published or not", async () => {
  // The gap is about editors. A client's refusal does not depend on
  // whether the month is published, and does not change here.
  const refused = await as(CLIENT, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        category: "financials",
        "v:financials_fixed_costs": 1,
      }),
    ),
  );
  assert.match(refused?.error ?? "", /filled in by your strategist/);
});
