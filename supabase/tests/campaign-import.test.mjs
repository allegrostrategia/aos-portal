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

/**
 * §10.2's custom conversions, remembered per workspace.
 *
 * Driven through the action because the two things that matter cannot
 * be reached from a screen: a radio cannot send a value that is not one
 * of its three, and a client cannot reach the card at all.
 */
const { saveColumnMaps } = await import("../../src/lib/reporting/csv/column-map-actions.ts");

const maps = async () =>
  (await asMember(db, NINA, () => db.query(
    `select column_name, maps_to::text from public.report_column_maps
      where workspace_id = '${WS}' order by column_name`,
  ))).rows;

test("a conversion column is remembered against the workspace and platform", async () => {
  const result = await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads",
    "column:autumn workshop opt in": "leads",
    "column:black friday": "purchases",
  })));
  assert.equal(result?.error, undefined, result?.error);
  assert.deepEqual(await maps(), [
    { column_name: "autumn workshop opt in", maps_to: "leads" },
    { column_name: "black friday", maps_to: "purchases" },
  ]);
});

test("saying it again corrects rather than duplicating", async () => {
  await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads",
    "column:autumn workshop opt in": "ignored",
  })));
  const rows = await maps();
  assert.equal(rows.filter((r) => r.column_name === "autumn workshop opt in").length, 1);
  assert.equal(rows.find((r) => r.column_name === "autumn workshop opt in").maps_to, "ignored");
});

test("a choice that is not one of the three is dropped, not stored", async () => {
  // A radio cannot send one, but a form post is not a radio.
  const before = await maps();
  const result = await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads",
    "column:something else": "revenue",
  })));
  assert.match(result?.error ?? "", /nothing chosen/i);
  assert.deepEqual(await maps(), before);
});

test("a client cannot remember column maps", async () => {
  // §2: they view and comment. `report_can_edit` is false for them, and
  // the action refuses before the write.
  const before = await maps();
  const result = await as(CLIENT, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads",
    "column:smuggled": "leads",
  })));
  assert.match(result?.error ?? "", /isn't yours to change|don't have access/i);
  assert.deepEqual(await maps(), before);
});

test("a remembered answer can be changed later", async () => {
  await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads", "column:spring opt in": "leads",
  })));
  assert.equal(
    (await maps()).find((r) => r.column_name === "spring opt in").maps_to,
    "leads",
  );

  const result = await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads", "column:spring opt in": "purchases",
  })));
  assert.equal(result?.error, undefined, result?.error);
  assert.equal(
    (await maps()).find((r) => r.column_name === "spring opt in").maps_to,
    "purchases",
    "changed, not added alongside",
  );
});

test("and cleared, so the next upload asks again", async () => {
  const result = await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads", "column:spring opt in": "forget",
  })));
  assert.equal(result?.error, undefined, result?.error);
  assert.match(result?.notice ?? "", /forgotten/i);
  assert.ok(
    !(await maps()).some((r) => r.column_name === "spring opt in"),
    "the answer is gone, so the column is unrecognised again",
  );
});

test("clearing one answer leaves the others alone, including other platforms", async () => {
  await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads",
    "column:keep me": "leads", "column:drop me": "purchases",
  })));
  // The same column name on the other platform is a different answer —
  // forgetting one must not take the other with it.
  await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_content", "column:drop me": "leads",
  })));
  await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads", "column:drop me": "forget",
  })));

  const rows = await asMember(db, NINA, () => db.query(
    `select column_name, platform::text, maps_to::text from public.report_column_maps
      where workspace_id = '${WS}' order by platform, column_name`));
  assert.ok(rows.rows.some((r) => r.column_name === "keep me" && r.maps_to === "leads"));
  assert.ok(
    !rows.rows.some((r) => r.column_name === "drop me" && r.platform === "meta_ads"),
    "the ads one is gone",
  );
  assert.ok(
    rows.rows.some((r) => r.column_name === "drop me" && r.platform === "meta_content"),
    "and the content one is not",
  );
});

test("changing an answer does not touch a month already saved", async () => {
  // **The figures stay.** Changing what a column counts as changes what
  // the NEXT upload counts; a month somebody has already saved keeps
  // what it has until they upload and save again (Dom, 12 October).
  const before = await asMember(db, NINA, () => db.query(
    `select count(*)::int c, coalesce(sum(value::float), 0) total
       from public.report_values where workspace_id = '${WS}' and month = '${MONTH}'`));

  await as(ELIZE, () => saveColumnMaps(null, form({
    workspace_id: WS, platform: "meta_ads", "column:keep me": "forget",
  })));

  const after = await asMember(db, NINA, () => db.query(
    `select count(*)::int c, coalesce(sum(value::float), 0) total
       from public.report_values where workspace_id = '${WS}' and month = '${MONTH}'`));
  assert.deepEqual(after.rows, before.rows, "not one figure moved");
});

// ------------------------------------------------------- who gets the card

const { uploadFor } = await import("../../src/lib/reporting/csv/upload-for.ts");

const cardFor = (kind, over = {}) =>
  as(NINA, () =>
    uploadFor({
      category: "ads",
      locked: false,
      canEdit: true,
      kind,
      workspaceId: WS,
      monthLabel: "September 2026",
      ...over,
    }),
  );

/**
 * **Decision 36, reversed by Nina on 28 October.** A member uploads their
 * own Meta exports now, under the same rules as a retainer client.
 *
 * Tested on `uploadFor` rather than on a screen because `uploadFor` is the
 * only thing that decides, and the two screens that draw the card both
 * ask it. The three kinds and the three other gates are all one
 * expression, so they are all asserted here or none of them are.
 */
test("a member gets the upload card; Chiarezza does not", async () => {
  assert.ok(await cardFor("retainer"), "a retainer client's screen, unchanged");
  assert.ok(await cardFor("aos_member"), "a member's own screen, decision 36 reversed");
  assert.equal(
    await cardFor("chiarezza"),
    null,
    "a one-off attendee stays manual until Nina says otherwise",
  );
});

test("and nobody gets it on a locked month, a read-only screen, or Email", async () => {
  assert.equal(await cardFor("aos_member", { locked: true }), null, "a published month");
  assert.equal(await cardFor("aos_member", { canEdit: false }), null, "cannot edit");
  assert.equal(
    await cardFor("aos_member", { category: "email" }),
    null,
    "Email has no file to upload",
  );
  assert.equal(
    await cardFor("retainer", { category: "financials" }),
    null,
    "Financials is manual for good — payment exports carry names and card details",
  );
});

test("the card carries the remembered column maps, whoever it is drawn for", async () => {
  await as(NINA, () =>
    db.query(
      `insert into public.report_column_maps (workspace_id, platform, column_name, maps_to)
         values ($1, 'meta_ads', 'Autumn Workshop Opt In', 'leads')`,
      [WS],
    ),
  );

  const card = await cardFor("aos_member");
  assert.equal(card?.platform, "meta_ads");
  // Lower-cased on the way out, because a file's own spelling is matched
  // against it and the two never agree on capitals.
  assert.equal(card?.columnMaps["autumn workshop opt in"], "leads");
});
