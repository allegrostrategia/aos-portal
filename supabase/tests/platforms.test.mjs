/**
 * More than one social platform (§5.2, built 11 November).
 *
 * The structure was always there — every Social Media figure hangs off a
 * `social_platform` row in `report_entities` — but nothing could make a
 * second row and every reader took the first. These drive the actions
 * that make and use them.
 *
 * The one that matters is the last: a save lands on the platform the
 * form was showing, and refuses an id that is not this client's. Getting
 * that wrong writes somebody's figures onto the wrong platform, which is
 * the kind of mistake nobody finds for a month.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { savePlatform, retirePlatform } = await import(
  "../../src/lib/reporting/platform-actions.ts"
);
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
let OTHER;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${SEP}')).id as id`)
  ).rows[0].id;
  OTHER = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Somebody Else', 'Bella Test', '${SEP}')).id as id`)
  ).rows[0].id;
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

const platforms = () =>
  rows(`select id, name, active, sort_order from public.report_entities
         where workspace_id = '${WS}' and entity_type = 'social_platform'
         order by sort_order, name`);

const figuresOn = (entityId) =>
  rows(`select metric_key, value::float v from public.report_values
         where workspace_id = '${WS}' and entity_id = '${entityId}' order by metric_key`);

test("the first save makes Instagram, as it always did", async () => {
  const saved = await as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: SEP,
        category: "social_media",
        "v:social_media_followers_at_month_end": 26420,
      }),
    ),
  );
  assert.equal(saved?.error, undefined, saved?.error);

  const made = await platforms();
  assert.equal(made.length, 1);
  assert.equal(made[0].name, "Instagram");
  assert.deepEqual(await figuresOn(made[0].id), [
    { metric_key: "social_media_followers_at_month_end", v: 26420 },
  ]);
});

test("a second platform is added, and takes the next place in the order", async () => {
  const added = await as(NINA, () =>
    savePlatform(null, form({ workspace_id: WS, name: "LinkedIn" })),
  );
  assert.match(added?.notice ?? "", /LinkedIn added/);

  const made = await platforms();
  assert.deepEqual(
    made.map((p) => p.name),
    ["Instagram", "LinkedIn"],
    "Instagram stays first, which is what makes it the main one",
  );
  assert.ok(made[1].sort_order > made[0].sort_order);
});

test("and not twice under the same name", async () => {
  const again = await as(NINA, () =>
    savePlatform(null, form({ workspace_id: WS, name: "LinkedIn" })),
  );
  assert.match(again?.error ?? "", /already a platform called "LinkedIn"/);
  assert.equal((await platforms()).length, 2);
});

test("renaming keeps the row, and therefore every figure on it", async () => {
  const [instagram] = await platforms();
  const before = await figuresOn(instagram.id);

  const renamed = await as(NINA, () =>
    savePlatform(null, form({ workspace_id: WS, platform_id: instagram.id, name: "Instagram UK" })),
  );
  assert.match(renamed?.notice ?? "", /Renamed to Instagram UK/);

  const [after] = await platforms();
  assert.equal(after.id, instagram.id, "the same row");
  assert.deepEqual(await figuresOn(instagram.id), before, "and the same figures");
});

test("retiring hides it and deletes nothing (rule 7)", async () => {
  const linkedIn = (await platforms()).find((p) => p.name === "LinkedIn");
  await as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: SEP,
        category: "social_media",
        platform_id: linkedIn.id,
        "v:social_media_followers_at_month_end": 3120,
      }),
    ),
  );

  const retired = await as(NINA, () =>
    retirePlatform(null, form({ workspace_id: WS, platform_id: linkedIn.id })),
  );
  assert.match(retired?.notice ?? "", /past months are untouched/);

  const row = (await platforms()).find((p) => p.id === linkedIn.id);
  assert.equal(row.active, false);
  assert.deepEqual(
    await figuresOn(linkedIn.id),
    [{ metric_key: "social_media_followers_at_month_end", v: 3120 }],
    "its figures are exactly where they were",
  );

  const back = await as(NINA, () =>
    retirePlatform(null, form({ workspace_id: WS, platform_id: linkedIn.id, restore: "1" })),
  );
  assert.match(back?.notice ?? "", /Back in use/);
});

test("the last live platform cannot be retired", async () => {
  // Social Media's figures have to belong to one, so retiring the only
  // live platform would make the whole section unfillable with nothing
  // on screen saying why.
  const linkedIn = (await platforms()).find((p) => p.name === "LinkedIn");
  await as(NINA, () => retirePlatform(null, form({ workspace_id: WS, platform_id: linkedIn.id })));

  const instagram = (await platforms()).find((p) => p.active);
  const refused = await as(NINA, () =>
    retirePlatform(null, form({ workspace_id: WS, platform_id: instagram.id })),
  );
  assert.match(refused?.error ?? "", /Keep one platform/);
  assert.equal((await platforms()).find((p) => p.id === instagram.id).active, true);

  await as(NINA, () =>
    retirePlatform(null, form({ workspace_id: WS, platform_id: linkedIn.id, restore: "1" })),
  );
});

test("THE POINT: a save lands on the platform the form was showing", async () => {
  const [instagram, linkedIn] = await platforms();

  await as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: SEP,
        category: "social_media",
        platform_id: linkedIn.id,
        "v:social_media_posts_published": 9,
      }),
    ),
  );

  const theirs = await figuresOn(linkedIn.id);
  assert.ok(
    theirs.some((r) => r.metric_key === "social_media_posts_published" && r.v === 9),
    "LinkedIn has the nine posts",
  );
  const first = await figuresOn(instagram.id);
  assert.ok(
    !first.some((r) => r.metric_key === "social_media_posts_published"),
    "and Instagram was not touched",
  );
});

test("a platform id from another client is refused, not quietly redirected", async () => {
  let theirs;
  await asMember(db, NINA, async () => {
    theirs = (
      await db.query(`insert into public.report_entities (workspace_id, entity_type, name)
                      values ('${OTHER}', 'social_platform', 'Instagram') returning id`)
    ).rows[0].id;
  });

  const refused = await as(NINA, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: SEP,
        category: "social_media",
        platform_id: theirs,
        "v:social_media_reach": 999,
      }),
    ),
  );
  assert.match(refused?.error ?? "", /Couldn't set up the social platform/);

  const leaked = await rows(
    `select count(*)::int c from public.report_values where entity_id = '${theirs}'`,
  );
  assert.equal(leaked[0].c, 0, "and nothing was written against it");
});

test("a client cannot add a platform to their own report", async () => {
  // A retainer client views and comments; their report is filled in by
  // their Allegro team, and `report_can_edit` is false for them by
  // design. The action says so rather than failing silently.
  const refused = await as(CLIENT, () =>
    savePlatform(null, form({ workspace_id: WS, name: "Threads" })),
  );
  assert.match(refused?.error ?? "", /filled in by your Allegro team|don't have access/);
  assert.equal((await platforms()).length, 2);
});
