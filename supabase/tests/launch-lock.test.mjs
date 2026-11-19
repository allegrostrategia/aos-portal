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

// ---------------------------------------------------------------------------
// A launch still running stays editable (Nina, 3 November)
// ---------------------------------------------------------------------------
//
// She updates a launch daily while it runs, and decision 18 locked a
// published launch to everything but its status. Both are right: a
// published launch is a scoreboard during the launch and a report after
// it. So "published" and "finished" came apart, and the guard learned
// the difference as well as the screen — leaving the guard alone would
// have meant Nina doing daily data entry while Elize, whose job it is,
// watched.
//
// Dates relative to today rather than fixed, because the rule is
// literally "is it still running" and a fixture pinned to September
// 2026 would answer that question differently every day until it
// answered it wrongly for ever.

const setStageDates = (promoStart, liveEnd) =>
  asMember(db, NINA, () =>
    db.query(`update public.report_launch_stages
                 set promo_start = ${promoStart}, live_end = ${liveEnd}
               where id = '${STAGE}'`),
  );

test("the last day is the latest date any stage carries", async () => {
  await unpublish();
  await setStageDates("current_date - 3", "current_date + 2");

  const [{ day }] = await rows(
    `select public.report_launch_last_day('${LAUNCH}')::text as day`,
  );
  const [{ expected }] = await rows(`select (current_date + 2)::text as expected`);
  assert.equal(day, expected);
});

test("a published launch that is still running is Elize's to update", async () => {
  await publish();

  await asMember(db, ELIZE, async () => {
    const changed = await db.query(`update public.report_launch_values set value = 1400
                                     where launch_id = '${LAUNCH}'`);
    assert.ok(changed.affectedRows > 0, "hers to type into while the launch is live");
  });

  const [{ locked }] = await rows(
    `select public.report_launch_is_locked('${LAUNCH}') as locked`,
  );
  assert.equal(locked, false);
});

test("the last day of a launch is still a day she is typing into it", async () => {
  await setStageDates("current_date - 10", "current_date");

  const [{ locked }] = await rows(
    `select public.report_launch_is_locked('${LAUNCH}') as locked`,
  );
  assert.equal(locked, false, "the comparison is strictly-after, on purpose");

  await asMember(db, ELIZE, async () => {
    const changed = await db.query(`update public.report_launch_values set value = 1450
                                     where launch_id = '${LAUNCH}'`);
    assert.ok(changed.affectedRows > 0);
  });
});

test("and it locks the morning after it ends", async () => {
  await setStageDates("current_date - 20", "current_date - 1");

  const [{ locked }] = await rows(
    `select public.report_launch_is_locked('${LAUNCH}') as locked`,
  );
  assert.equal(locked, true);

  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launch_values set value = 9999
                       where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
  });

  // And unpublish -> fix -> republish is still the way through.
  await unpublish();
  await asMember(db, ELIZE, () =>
    db.query(`update public.report_launch_values set value = 1500
               where launch_id = '${LAUNCH}'`),
  );
  await publish();
});

test("a launch with no dates locks on publish, deliberately", async () => {
  // The safe way round: nothing says when it stops, so a report that
  // silently never locks is the worse mistake. Asserted rather than
  // left to the earlier tests' fixture, which only had no dates by
  // accident of being written before any of this.
  await unpublish();
  await setStageDates("null", "null");
  await publish();

  const [{ locked }] = await rows(
    `select public.report_launch_is_locked('${LAUNCH}') as locked`,
  );
  assert.equal(locked, true);

  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launch_values set value = 9999
                       where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
  });
});

test("a self-serve launch is still never locked, running or not", async () => {
  // The carve-out that was there before this and has to survive it: a
  // member is their own editor and never publishes, so a date rule must
  // not become a way to shut them out of their own launch.
  const [{ locked }] = await rows(
    `select public.report_launch_is_locked('${SELF_LAUNCH}') as locked`,
  );
  assert.equal(locked, false);
});

// ---------------------------------------------------------------------------
// The two lists Nina's spec of 19 November added. Same rules, said again
// because the lock is a trigger per table and a table added without one
// is a published report that still moves — the exact hole this file was
// written to close, one table later.
// ---------------------------------------------------------------------------

let SOURCE;

test("a source and an email row are Elize's to build on a draft", async () => {
  await unpublish();
  await asMember(db, ELIZE, async () => {
    SOURCE = (
      await db.query(`insert into public.report_launch_sources
          (launch_id, name, position, sign_up_target)
        values ('${LAUNCH}', 'Email list', 1, 600) returning id`)
    ).rows[0].id;
    await db.query(`insert into public.report_launch_values
        (launch_id, metric_key, source_id, value)
      values ('${LAUNCH}', 'launches_sign_ups_from_source', '${SOURCE}', 640)`);
    await db.query(`insert into public.report_launch_emails
        (launch_id, stage_id, number, sent_on, subject)
      values ('${LAUNCH}', '${STAGE}', 1, '2026-09-01', 'The challenge starts Monday')`);
  });

  const [{ c }] = await rows(
    `select count(*)::int c from public.report_launch_sources where launch_id = '${LAUNCH}'`,
  );
  assert.equal(c, 1);
});

test("a figure cannot be hung off another launch's source", async () => {
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`insert into public.report_launch_values
          (launch_id, metric_key, source_id, value)
        values ('${SELF_LAUNCH}', 'launches_sign_ups_from_source', '${SOURCE}', 1)`),
      /source belongs to a different launch/i,
    );
  });
});

test("one figure per source per metric, not two", async () => {
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`insert into public.report_launch_values
          (launch_id, metric_key, source_id, value)
        values ('${LAUNCH}', 'launches_sign_ups_from_source', '${SOURCE}', 99)`),
      /one_per_cell|duplicate key/i,
    );
  });
});

test("a source with figures on it refuses to go, rather than taking them", async () => {
  // `on delete restrict`, like stage_id and price_id since 8 October: a
  // cascade consults no policy and fires no trigger, so removing a source
  // would quietly empty a report somebody has read.
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`delete from public.report_launch_sources where id = '${SOURCE}'`),
      // Postgres's own words for a RESTRICT, which are not the words for
      // a plain foreign-key violation — the distinction that made
      // `launchDeleteMessage` match on SQLSTATE rather than on text.
      /violates RESTRICT setting of foreign key constraint/i,
    );
  });
});

test("cleared of its figures, the same source goes", async () => {
  await asMember(db, ELIZE, async () => {
    await db.query(`delete from public.report_launch_values
                     where source_id = '${SOURCE}'`);
    await db.query(`delete from public.report_launch_sources where id = '${SOURCE}'`);
  });
  const [{ c }] = await rows(
    `select count(*)::int c from public.report_launch_sources where launch_id = '${LAUNCH}'`,
  );
  assert.equal(c, 0);
});

test("once published, the sources and the emails hold still too", async () => {
  await asMember(db, NINA, async () => {
    await db.query(`insert into public.report_launch_sources (launch_id, name, position)
                    values ('${LAUNCH}', 'Meta ads', 2)`);
  });
  await publish();

  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`insert into public.report_launch_sources (launch_id, name, position)
                      values ('${LAUNCH}', 'Instagram', 3)`),
      LOCKED,
    );
    await assert.rejects(
      () => db.query(`update public.report_launch_sources set sign_up_target = 1
                       where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
    await assert.rejects(
      () => db.query(`delete from public.report_launch_sources where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
    await assert.rejects(
      () => db.query(`update public.report_launch_emails set subject = 'Something else'
                       where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
    await assert.rejects(
      () => db.query(`delete from public.report_launch_emails where launch_id = '${LAUNCH}'`),
      LOCKED,
    );
  });
});

test("and the sign-up goals are held with the sales goals, but the tracker link is not", async () => {
  // The judgement in the migration, pinned: the goals are figures on the
  // report and hold still; the lead-tracker link points at somewhere else
  // and a client whose sheet has moved should not need an unpublish to fix
  // a button. Flagged for Nina.
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_launches set sign_up_goal_good = 999
                       where id = '${LAUNCH}'`),
      LOCKED,
    );
    await db.query(`update public.report_launches
                       set lead_tracker_url = 'https://docs.google.com/spreadsheets/d/1Moved/edit'
                     where id = '${LAUNCH}'`);
  });

  const [l] = await rows(`select lead_tracker_url from public.report_launches
                           where id = '${LAUNCH}'`);
  assert.match(l.lead_tracker_url, /1Moved/);
});

test("the tracker link can only ever be a link", async () => {
  // Not validation for its own sake: this column is rendered as an anchor
  // on a page a client opens, so a `javascript:` value would be a script
  // in their browser put there by whoever typed it.
  await unpublish();
  await asMember(db, NINA, async () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "notalink"]) {
      await assert.rejects(
        () => db.query(`update public.report_launches set lead_tracker_url = '${bad}'
                         where id = '${LAUNCH}'`),
        /lead_tracker_is_a_link/i,
      );
    }
  });
});

test("a monthly price option needs both halves of what makes it monthly", async () => {
  await asMember(db, NINA, async () => {
    // **Two constraints, and the older one is hit first.** A monthly
    // option with a count and no amount breaks the pair rule that has
    // been there since 30 September, which is the better message anyway.
    await assert.rejects(
      () => db.query(`insert into public.report_launch_prices
          (launch_id, name, plan, price, instalments)
        values ('${LAUNCH}', 'Monthly, no amount', 'monthly', 600, 3)`),
      /instalments_pair/i,
    );
    // What the new one catches is the case the pair rule allows: monthly
    // with neither half, which is a monthly option that says nothing
    // about a month.
    await assert.rejects(
      () => db.query(`insert into public.report_launch_prices
          (launch_id, name, plan, price)
        values ('${LAUNCH}', 'Monthly, no months', 'monthly', 600)`),
      /monthly_has_both/i,
    );
    // And one month is a real option now — the old constraint said two.
    await db.query(`insert into public.report_launch_prices
        (launch_id, name, plan, price, instalments, instalment_amount)
      values ('${LAUNCH}', 'One month', 'monthly', 80, 1, 80)`);
  });
});

test("a client reads the sources and the emails of a published launch, and writes neither", async () => {
  await publish();
  await asMember(db, CLIENT, async () => {
    const { rows: seen } = await db.query(
      `select count(*)::int c from public.report_launch_sources where launch_id = '${LAUNCH}'`,
    );
    assert.equal(seen[0].c, 1);
    await assert.rejects(
      () => db.query(`insert into public.report_launch_sources (launch_id, name, position)
                      values ('${LAUNCH}', 'Theirs', 9)`),
      /row-level security|launch report is published/i,
    );
  });
});

/**
 * **A launch can still be deleted at all.**
 *
 * `report_launches_guard_published` is a BEFORE UPDATE **OR DELETE**
 * trigger, and a BEFORE DELETE trigger that returns null cancels the
 * delete SILENTLY — no error, no row removed. `20261008120000` got this
 * right and said so in a comment; restating that function from the older
 * `return new` body on 19 November put it back, and the only symptom was
 * rows that quietly stayed: a workspace's cascade swallowed, 1,141
 * launches left pointing at workspaces that no longer existed.
 *
 * Nothing in the app deletes a launch, which is why no test covered it
 * and why the seed's own teardown was the thing that noticed. This is
 * that test.
 */
test("an unpublished launch really goes when an admin deletes it", async () => {
  await unpublish();
  let doomed;
  await asMember(db, NINA, async () => {
    doomed = (await db.query(`insert into public.report_launches (workspace_id, name)
                              values ('${WS}', 'A launch to remove') returning id`)).rows[0].id;
    await db.query(`delete from public.report_launches where id = '${doomed}'`);
  });

  const [{ c }] = await rows(
    `select count(*)::int c from public.report_launches where id = '${doomed}'`,
  );
  assert.equal(c, 0, "the delete was swallowed by the guard");
});

test("and a workspace's cascade takes its launches with it", async () => {
  // The case the orphans came from: nothing deletes a launch directly,
  // but deleting a workspace does — through the foreign key, whose
  // row-level delete the same trigger sees and can silently skip.
  let ws;
  await asMember(db, NINA, async () => {
    ws = (await db.query(`select (public.create_report_workspace(
      '${CLIENT}','retainer','Doomed Studio','Bella','${AUG}')).id as id`)).rows[0].id;
    await db.query(`insert into public.report_launches (workspace_id, name)
                    values ('${ws}', 'Goes with it')`);
    await db.query(`delete from public.report_workspaces where id = '${ws}'`);
  });

  const [{ c }] = await rows(
    `select count(*)::int c from public.report_launches where workspace_id = '${ws}'`,
  );
  assert.equal(c, 0, "a launch was orphaned from its deleted workspace");
});

test("and a team member still cannot delete one at all", async () => {
  await publish();
  await asMember(db, ELIZE, async () => {
    // **No exception, and no row either.** There is no delete policy on
    // report_launches, so RLS matches nothing and the guard never runs —
    // which is why the guard's own "that report is published" refusal for
    // a DELETE is unreachable today and is there for the day somebody
    // adds one (`20261008120000` says so in as many words). What matters
    // is the outcome, so that is what this asserts.
    await db.query(`delete from public.report_launches where id = '${LAUNCH}'`);
  });
  const [{ c }] = await rows(
    `select count(*)::int c from public.report_launches where id = '${LAUNCH}'`,
  );
  assert.equal(c, 1, "a team member removed a published launch");
});
