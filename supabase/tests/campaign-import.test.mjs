/**
 * Campaigns an import asked for, created by the save that writes their
 * figures (§10.2, Dom 12 October).
 *
 * Driven through the real action as the real people, because the two
 * things that matter here cannot be seen from a screen: a name that
 * already exists must be reused rather than duplicated, and an insert
 * RLS refuses must be reported rather than reported as success.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveCampaignMonth } = await import("../../src/lib/reporting/campaign-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const MONTH = "2026-09-01";

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
    '${CLIENT}','retainer','Northwind Studio','Bella','2026-08-01')).id as id`)).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
});

const as = (uid, fn) => { configure(db, uid); return fn(); };
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};
const campaigns = async () =>
  (await asMember(db, NINA, () => db.query(
    `select name, coalesce(campaign_goal::text, '-') as goal from public.report_entities
      where workspace_id = '${WS}' and entity_type = 'ad_campaign' order by name`,
  ))).rows;

const importOf = (name, extra = {}) =>
  form({
    workspace_id: WS, month: MONTH,
    "new:0:name": name, "new:0:goal": "leads",
    "nv:0:ads_spend": 400, "nv:0:ads_impressions": 40000,
    ...extra,
  });

test("a ticked campaign is created, with its figures, in one save", async () => {
  const result = await as(ELIZE, () => saveCampaignMonth(null, importOf("Spring leads")));
  assert.equal(result?.error, undefined, result?.error);

  assert.deepEqual(await campaigns(), [{ name: "Spring leads", goal: "leads" }]);

  const values = await asMember(db, NINA, () => db.query(
    `select v.metric_key, v.value::float as value from public.report_values v
      join public.report_entities e on e.id = v.entity_id
     where v.workspace_id = '${WS}' and v.month = '${MONTH}' and e.name = 'Spring leads'
     order by v.metric_key`));
  assert.deepEqual(values.rows, [
    { metric_key: "ads_impressions", value: 40000 },
    { metric_key: "ads_spend", value: 400 },
  ]);
});

test("a name that already exists is reused, not duplicated", async () => {
  // Saving the same import twice — a second upload, or a double click —
  // must not leave two campaigns with one name and the figures split
  // between them.
  const result = await as(ELIZE, () => saveCampaignMonth(null, importOf("Spring leads")));
  assert.equal(result?.error, undefined, result?.error);

  const rows = await campaigns();
  assert.equal(rows.filter((r) => r.name === "Spring leads").length, 1, "still one");
});

test("a name is trimmed before it is matched or created", async () => {
  const result = await as(ELIZE, () => saveCampaignMonth(null, importOf("  Spring leads  ")));
  assert.equal(result?.error, undefined, result?.error);
  assert.equal((await campaigns()).filter((r) => r.name === "Spring leads").length, 1);
});

test("a client cannot bring a campaign into existence by saving one", async () => {
  // §2: a retainer client views and comments, and `report_can_edit` is
  // false for them. The action refuses before the insert; the insert
  // would be refused too.
  const before = (await campaigns()).length;
  const result = await as(CLIENT, () => saveCampaignMonth(null, importOf("Smuggled in")));
  assert.ok(result?.error, "refused");
  assert.equal((await campaigns()).length, before, "and nothing appeared");
});

test("a pending campaign with no name is ignored, not created blank", async () => {
  const before = (await campaigns()).length;
  await as(ELIZE, () => saveCampaignMonth(null, form({
    workspace_id: WS, month: MONTH,
    "new:0:name": "   ", "new:0:goal": "leads", "nv:0:ads_spend": 10,
  })));
  assert.equal((await campaigns()).length, before);
});
