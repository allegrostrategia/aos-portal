/**
 * A published launch stops changing, and its cover lives somewhere private.
 *
 * Dom's two conditions before Stage 4 is built, 8 October. Neither
 * migration is applied to live; this is what the harness says about them.
 *
 * A launch is not a month, so neither the published-month lock nor the
 * carried-figure snapshot reaches one. It becomes visible to a client the
 * same way though — `published_at`, set by an admin alone — so it is
 * corrected the same way: unpublish, fix, republish.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const MEMBER = "44444444-4444-4444-4444-444444444444";
const AUG = "2026-08-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test'), ('${MEMBER}','ruth@member.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active'),
    ('${MEMBER}','ruth@member.test','Ruth Member','member','active');
`);

let WS, SELF, LAUNCH, SELF_LAUNCH, STAGE, PRICE;
await asMember(db, NINA, async () => {
  WS = (await db.query(`select (public.create_report_workspace(
    '${CLIENT}','retainer','Northwind Studio','Bella Test','${AUG}')).id as id`)).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
  SELF = (await db.query(`select (public.create_report_workspace(
    '${MEMBER}','aos_member','Ruth Test Coaching','Ruth','${AUG}')).id as id`)).rows[0].id;

  LAUNCH = (await db.query(`insert into public.report_launches (workspace_id, name, goal_good)
                            values ('${WS}', 'Autumn challenge', 30) returning id`)).rows[0].id;
  SELF_LAUNCH = (await db.query(`insert into public.report_launches (workspace_id, name)
                                 values ('${SELF}', 'Her own launch') returning id`)).rows[0].id;
  STAGE = (await db.query(`insert into public.report_launch_stages
      (launch_id, position, stage_type, name, is_main_selling_stage)
    values ('${LAUNCH}', 1, 'challenge', 'Five day challenge', true) returning id`)).rows[0].id;
  PRICE = (await db.query(`insert into public.report_launch_prices (launch_id, name, price, is_main)
                           values ('${LAUNCH}', 'Pay in full', 500, true) returning id`)).rows[0].id;
  await db.query(`insert into public.report_launch_values (launch_id, stage_id, metric_key, value)
                  values ('${LAUNCH}', '${STAGE}', 'launches_sign_ups', 1277)`);
});

const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;
const publish = (id = LAUNCH) =>
  asMember(db, NINA, () =>
    db.query(`update public.report_launches set published_at = now(), published_by = '${NINA}'
               where id = '${id}'`),
  );
const unpublish = (id = LAUNCH) =>
  asMember(db, NINA, () =>
    db.query(`update public.report_launches set published_at = null, published_by = null
               where id = '${id}'`),
  );
const LOCKED = /launch report is published\. Unpublish it to make changes/i;

// ---------------------------------------------------------------------------

test("a draft launch is Elize's to build", async () => {
  await asMember(db, ELIZE, async () => {
    await db.query(`update public.report_launch_values set value = 1300
                     where launch_id = '${LAUNCH}'`);
    await db.query(`update public.report_launch_prices set price = 550 where id = '${PRICE}'`);
    await db.query(`update public.report_launches set name = 'Autumn challenge 2026'
                     where id = '${LAUNCH}'`);
  });
  const [l] = await rows(`select name from public.report_launches where id = '${LAUNCH}'`);
  assert.equal(l.name, "Autumn challenge 2026");
});

test("and she cannot publish it — that has been Nina's since 30 September", async () => {
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launches set published_at = now() where id = '${LAUNCH}'`),
      /Only an admin can publish a launch report/,
    );
  });
});

test("once published, the figures hold still", async () => {
  await publish();
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launch_values set value = 9999
                       where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
    await assert.rejects(
      () => db.query(`insert into public.report_launch_values (launch_id, stage_id, metric_key, value)
                      values ('${LAUNCH}', '${STAGE}', 'launches_replay_watchers', 40)`),
      LOCKED,
    );
  });
});

test("a figure CAN be deleted on a draft launch, and not on a published one", async () => {
  // This test used to say a figure could not be deleted at all, because
  // no launch table had a delete policy — so an editor emptying a box
  // matched no row, which under RLS is not an error. `20261008120000`
  // gave them one, bounded by the guard below, and this is the shape it
  // was written to become.
  await unpublish();
  const before = await rows(
    `select count(*)::int c from public.report_launch_values where launch_id = '${LAUNCH}'`,
  );
  assert.ok(before[0].c > 0, "there is a figure to remove");

  await asMember(db, ELIZE, async () => {
    const gone = await db.query(
      `delete from public.report_launch_values where launch_id = '${LAUNCH}'`,
    );
    assert.equal(gone.affectedRows, before[0].c, "hers to clear while it is a draft");
  });

  // Put one back, publish, and the same delete is refused.
  await asMember(db, NINA, () =>
    db.query(`insert into public.report_launch_values (launch_id, stage_id, metric_key, value)
              values ('${LAUNCH}', '${STAGE}', 'launches_sign_ups', 1277)`),
  );
  await publish();
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`delete from public.report_launch_values where launch_id = '${LAUNCH}'`),
      LOCKED,
      "and not once it has gone out",
    );
  });
});

test("the goals and the labels are held; the status is not", async () => {
  // Decision 15, and the one judgement call in this migration. A client
  // looking at "Live now" three weeks after the cart shut is worse served
  // than one whose badge changed quietly. Every figure beside it is held.
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launches set goal_good = 60 where id = '${LAUNCH}'`),
      LOCKED,
    );
    await assert.rejects(
      () => db.query(`update public.report_launches set name = 'Something else' where id = '${LAUNCH}'`),
      LOCKED,
    );
    await db.query(`update public.report_launches set status = 'completed' where id = '${LAUNCH}'`);
  });
  const [l] = await rows(`select status::text, goal_good from public.report_launches where id = '${LAUNCH}'`);
  assert.equal(l.status, "completed");
  assert.equal(l.goal_good, 30);
});

test("an editor cannot write the snapshot, and a draft launch has none", async () => {
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launches set carried = '{"offerName":"Mine"}'::jsonb
                       where id = '${LAUNCH}'`),
      /Only an admin can publish a launch report/,
    );
  });
  const [l] = await rows(`select carried::text from public.report_launches where id = '${SELF_LAUNCH}'`);
  assert.equal(l.carried, "{}");
});

test("unpublish, fix, republish — the way through, same as a month", async () => {
  await unpublish();
  await asMember(db, ELIZE, () =>
    db.query(`update public.report_launch_values set value = 1400 where launch_id = '${LAUNCH}'`),
  );
  await publish();
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launch_values set value = 1 where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
  });
  const [v] = await rows(`select value::float v from public.report_launch_values where launch_id = '${LAUNCH}'`);
  assert.equal(v.v, 1400);
});

test("a self-serve launch is never locked, published or not", async () => {
  // Same trap as months: a self-serve client is their own editor, so an
  // unscoped lock would shut them out behind an admin-only button they
  // never see.
  await publish(SELF_LAUNCH);
  const [locked] = await rows(`select public.report_launch_is_locked('${SELF_LAUNCH}') as l`);
  assert.equal(locked.l, false);

  await asMember(db, MEMBER, () =>
    db.query(`update public.report_launches set name = 'Renamed by her' where id = '${SELF_LAUNCH}'`),
  );
  const [l] = await rows(`select name from public.report_launches where id = '${SELF_LAUNCH}'`);
  assert.equal(l.name, "Renamed by her");
});

// --- the cover bucket ------------------------------------------------------

test("the cover bucket is private, images only, and capped", async () => {
  const { rows: found } = await db.query(`select public::text, file_size_limit,
                                                 array_to_string(allowed_mime_types, ',') as types
                                            from storage.buckets where id = 'launch-covers'`);
  const [b] = found;
  assert.ok(b, "the guarded block really ran here, rather than taking the other branch");
  assert.equal(b.public, "false", "a public bucket would be readable by anyone who guessed a path");
  assert.equal(Number(b.file_size_limit), 5242880);
  assert.equal(b.types, "image/jpeg,image/png,image/webp");
});

test("a path that is not a workspace id resolves to nobody, rather than raising", async () => {
  // An exception inside a storage policy is an error page, not a refusal.
  // BOTH helpers, because both sit in a policy. An earlier version of
  // this test checked only the workspace one, and a mutation making the
  // launch one raise went straight through it.
  const [r] = await rows(`select
      coalesce(public.report_workspace_from_path('not-a-uuid/x.png')::text, 'null') as a,
      coalesce(public.report_workspace_from_path('')::text, 'null') as b,
      public.report_workspace_from_path('${WS}/${LAUNCH}.png')::text as c,
      coalesce(public.report_launch_from_path('${WS}/not-a-uuid.png')::text, 'null') as d,
      coalesce(public.report_launch_from_path('${WS}')::text, 'null') as e,
      coalesce(public.report_launch_from_path('')::text, 'null') as f,
      public.report_launch_from_path('${WS}/${LAUNCH}.png')::text as g`);
  assert.equal(r.a, "null", "a workspace segment that is not an id");
  assert.equal(r.b, "null", "an empty path");
  assert.equal(r.c, WS);
  assert.equal(r.d, "null", "a launch segment that is not an id");
  assert.equal(r.e, "null", "no launch segment at all");
  assert.equal(r.f, "null");
  assert.equal(r.g, LAUNCH, "and the real thing, extension dropped");
});

/** Where a cover for a launch lives: <workspace>/<launch>.png */
const coverPath = (launchId, ws = WS) => `${ws}/${launchId}.png`;

test("a client cannot read the cover of a DRAFT launch", async () => {
  // The first of Dom's two corrections, 8 October. The first version asked
  // `report_can_view` on the workspace, which is true for the client all
  // the time — so they could have opened the picture for a launch they do
  // not know exists. `report_can_read_launch` carries the published check,
  // so the cover appears when the launch does.
  let draft;
  await asMember(db, NINA, async () => {
    draft = (
      await db.query(`insert into public.report_launches (workspace_id, name)
                      values ('${WS}', 'Not out yet') returning id`)
    ).rows[0].id;
  });
  await db.query(`insert into storage.objects (bucket_id, name)
                  values ('launch-covers', '${coverPath(draft)}')`);

  const seen = async (uid) =>
    (
      await asMember(db, uid, () =>
        db.query(`select count(*)::int c from storage.objects
                   where name = '${coverPath(draft)}'`),
      )
    ).rows[0].c;

  assert.equal(await seen(CLIENT), 0, "a draft launch's cover is not theirs to open");
  assert.equal(await seen(ELIZE), 1, "and it is Elize's, because she is building it");

  // And the moment it goes out, they can.
  await asMember(db, NINA, () =>
    db.query(`update public.report_launches set published_at = now(), published_by = '${NINA}'
               where id = '${draft}'`),
  );
  assert.equal(await seen(CLIENT), 1, "published, so the cover is theirs too");
});

test("an editor cannot replace the cover of a PUBLISHED launch", async () => {
  // The second correction. A cover is part of the report, so swapping one
  // on a launch the client has already seen is the same act as moving a
  // figure — which the lock refuses. Without this the picture was the one
  // thing on the page that could still change underneath them.
  //
  // LAUNCH is published by the test above it.
  const path = coverPath(LAUNCH);
  await db.query(`insert into storage.objects (bucket_id, name) values ('launch-covers', '${path}')`);

  await asMember(db, ELIZE, async () => {
    const replaced = await db.query(
      `update storage.objects set name = '${path}' where name = '${path}'`,
    );
    assert.equal(replaced.affectedRows ?? 0, 0, "the row is not hers to change while it is out");

    const removed = await db.query(`delete from storage.objects where name = '${path}'`);
    assert.equal(removed.affectedRows ?? 0, 0, "nor to remove");

    const added = await db.query(`insert into storage.objects (bucket_id, name)
                                  select 'launch-covers', '${WS}/${LAUNCH}-new.png'
                                   where public.report_can_edit('${WS}')
                                     and not public.report_launch_is_locked('${LAUNCH}')`);
    assert.equal(added.affectedRows ?? 0, 0, "and a new one is refused by the same rule");
  });

  // Taken back to draft, it is hers again — the way through, as everywhere.
  await unpublish();
  await asMember(db, ELIZE, async () => {
    const replaced = await db.query(
      `update storage.objects set owner = '${ELIZE}' where name = '${path}'`,
    );
    assert.equal(replaced.affectedRows ?? 0, 1);
  });
  await publish();
});

test("the cover's read and write rules are the workspace's own", async () => {
  // The policies ask report_can_view and report_can_edit — the same two
  // functions every report table uses — so there is no second set of rules
  // to drift. Asserted through those functions as the real people.
  const check = async (uid, expected, why) => {
    const r = await asMember(db, uid, () =>
      db.query(`select public.report_can_view('${WS}') v, public.report_can_edit('${WS}') e`),
    );
    assert.deepEqual([r.rows[0].v, r.rows[0].e], expected, why);
  };
  await check(ELIZE, [true, true], "an editor reads and replaces a cover");
  await check(CLIENT, [true, false], "the client sees theirs and cannot replace it");
  await check(MEMBER, [false, false], "somebody else's workspace is not theirs at all");
});

test("and Nina can put a cover on at all, which she could not", async () => {
  // The bug this test exists for: every policy on the bucket was built
  // on `report_can_edit` / `report_can_read_launch`, and both of those
  // ask one question — **is there a `report_access` row for this login
  // on this workspace.** An admin has none. So the bucket refused Nina
  // outright: she could neither upload a cover nor see one, and the only
  // symptom was "new row violates row-level security policy" from a
  // draft launch that was plainly hers.
  //
  // Every table in this module grants the admin through a separate
  // permissive policy (`report_launches_all_admin :: is_portal_admin()`)
  // rather than through those functions. The bucket now does the same.
  await unpublish();
  const draftPath = `${WS}/${LAUNCH}.png`;
  await db.query(`delete from storage.objects where name = '${draftPath}'`);

  await asMember(db, NINA, async () => {
    const added = await db.query(`insert into storage.objects (bucket_id, name)
                                  values ('launch-covers', '${draftPath}')`);
    assert.equal(added.affectedRows ?? 0, 1, "Nina can upload one");

    const seen = await db.query(`select count(*)::int c from storage.objects
                                  where name = '${draftPath}'`);
    assert.equal(seen.rows[0].c, 1, "and read it back");

    const gone = await db.query(`delete from storage.objects where name = '${draftPath}'`);
    assert.equal(gone.affectedRows ?? 0, 1, "and take it off again");
  });

  // Nothing about the admin arm reaches the client: it is `is_portal_admin()`,
  // not "anybody signed in".
  await db.query(`insert into storage.objects (bucket_id, name)
                  values ('launch-covers', '${draftPath}')`);
  await asMember(db, CLIENT, async () => {
    const seen = await db.query(`select count(*)::int c from storage.objects
                                  where name = '${draftPath}'`);
    assert.equal(seen.rows[0].c, 0, "a draft's cover is still invisible to the client");
  });
  await db.query(`delete from storage.objects where name = '${draftPath}'`);
  await publish();
});
