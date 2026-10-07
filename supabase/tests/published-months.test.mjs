/**
 * A published month stops changing.
 *
 * This file used to record the opposite. On 6 October it was written to
 * pin down a gap — an editor could change a published figure, rewrite a
 * top-three line and clear one — with a note that it was "written to
 * fail the day somebody locks it". Dom locked it on the 7th, so it
 * failed, and this is what replaced it.
 *
 * What the lock is, in one line: on a **published retainer** month,
 * nobody but an admin or the service role may write `report_values`,
 * `report_top_items` or `report_notes`, in any of the three verbs —
 * except a client's own reply, which publishing is what makes possible.
 *
 * Corrections go unpublish -> fix -> republish, and the last test here
 * walks that end to end, because a lock without a way through it is a
 * bug report waiting to be filed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

// The publish email builds its link from here. Without it the send fails,
// `email_sent_at` never lands, and the second publish would not know it was
// a correction — which is the thing the round trip below is checking.
process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { publishMonth, unpublishMonth, saveStrategistNote } = await import(
  "../../src/lib/reporting/note-actions.ts"
);
const { saveCategoryValues } = await import("../../src/lib/reporting/actions.ts");
const { saveTopItems } = await import("../../src/lib/reporting/top-item-actions.ts");
const { saveTargets } = await import("../../src/lib/reporting/target-actions.ts");
const { saveObjectives } = await import("../../src/lib/reporting/objective-actions.ts");
const { addClientReply, editClientReply } = await import(
  "../../src/lib/reporting/reply-actions.ts"
);

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const MEMBER = "44444444-4444-4444-4444-444444444444";
const AUG = "2026-08-01";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test'), ('${MEMBER}','ruth@member.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active'),
    ('${MEMBER}','ruth@member.test','Ruth Member','member','active');
`);

/** The retainer workspace the lock applies to, and a self-serve one it must not. */
let WS;
let SELF;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${AUG}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);

  SELF = (
    await db.query(`select (public.create_report_workspace(
      '${MEMBER}', 'aos_member', 'Ruth Test Coaching', 'Ruth', '${AUG}')).id as id`)
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

/**
 * The service role: no role switch and no claim, which is what it is.
 * `asMember(db, null, ...)` is not the same thing — it signs in as
 * `authenticated` with the literal string "null" for a uid.
 */
const asService = async (fn) => {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  return fn();
};

const saveFigure = (uid, { workspace = WS, month = AUG, value }) =>
  as(uid, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: workspace,
        month,
        category: "financials",
        "v:financials_fixed_costs": value,
      }),
    ),
  );

const saveHook = (uid, { month = AUG, body, views = "" }) =>
  as(uid, () =>
    saveTopItems(
      null,
      form({
        workspace_id: WS,
        month,
        "item:hook:1:body": body,
        "item:hook:1:views": views,
      }),
    ),
  );

const figure = async (workspace = WS, month = AUG) => {
  const r = await rows(`
    select value::float v from public.report_values
     where workspace_id = '${workspace}' and month = '${month}'
       and metric_key = 'financials_fixed_costs'`);
  return r.length ? r[0].v : null;
};

const LOCKED = /published\. Unpublish it to make changes/i;

// ---------------------------------------------------------------------------

test("a draft month is filled in, then published", async () => {
  assert.equal((await saveFigure(ELIZE, { value: 300 }))?.error, undefined);
  assert.equal((await saveHook(ELIZE, { body: "The one that worked", views: 40000 }))?.error, undefined);
  assert.equal(
    (await as(NINA, () => saveStrategistNote(null, form({ workspace_id: WS, month: AUG, body: "August went well." }))))
      ?.error,
    undefined,
  );

  const published = await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: AUG })));
  assert.equal(published?.error, undefined, published?.error);
  // Publishing queues the email through `after()`. Run it here, or it
  // lands after the test has ended and fails the run from outside it.
  await flushAfter();
  assert.equal(await figure(), 300);
  // The email is the client's only notice that the month exists, so the
  // round trip below depends on it having gone: `email_sent_at` is what
  // makes the second publish word itself as a correction.
  const [period] = await rows(`select email_sent_at, email_error, email_to
                                 from public.report_periods
                                where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(period.email_error, null);
  assert.ok(period.email_sent_at, "the client was emailed the first time");
  assert.equal(period.email_to, "bella@client.test");
});

// --- the editor: all three verbs, all three tables -------------------------

test("the editor cannot change a figure on a published month", async () => {
  const result = await saveFigure(ELIZE, { value: 9999 });
  assert.match(result?.error ?? "", LOCKED);
  assert.equal(await figure(), 300, "and the figure the client read is still the one there");
});

test("the editor cannot add a figure to a published month either", async () => {
  // Insert, not update: a metric with no row yet. A lock written only
  // against update would let a brand-new number appear in a report that
  // had already gone out, which is the same harm by the other verb.
  const before = await rows(`
    select count(*)::int c from public.report_values
     where workspace_id = '${WS}' and month = '${AUG}'`);

  const result = await as(ELIZE, () =>
    saveCategoryValues(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        category: "financials",
        "v:financials_team_costs": 500,
      }),
    ),
  );
  assert.match(result?.error ?? "", LOCKED);

  const after = await rows(`
    select count(*)::int c from public.report_values
     where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(after[0].c, before[0].c, "nothing was added");
});

test("the editor cannot rewrite a top-three line on a published month", async () => {
  const result = await saveHook(ELIZE, { body: "Something else entirely", views: 1 });
  assert.match(result?.error ?? "", LOCKED);

  const [row] = await rows(`
    select body from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}' and item_type = 'hook' and rank = 1`);
  assert.equal(row.body, "The one that worked");
});

test("the editor cannot clear a top-three line on a published month", async () => {
  // The question that started all of this. The delete policy ships in the
  // same migration as the guard precisely so this verb is covered: on
  // 6 October a guard over insert and update left the clear working.
  const result = await saveHook(ELIZE, { body: "" });
  assert.match(result?.error ?? "", LOCKED);

  const [row] = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(row.c, 1, "the line is still there");
});

test("the editor cannot revise the strategist note on a published month", async () => {
  const result = await as(ELIZE, () =>
    saveStrategistNote(null, form({ workspace_id: WS, month: AUG, body: "Actually, a different story." })),
  );
  assert.match(result?.error ?? "", LOCKED);

  const [row] = await rows(`
    select body from public.report_notes
     where workspace_id = '${WS}' and month = '${AUG}' and note_type = 'strategist'`);
  assert.equal(row.body, "August went well.");
});

test("the raw delete is refused by the database, not only by the action", async () => {
  // `report_top_items` is the one reporting table with a delete policy —
  // the one this migration adds — so it is the one where a delete reaches
  // the guard at all. Asked directly, as Elize, over RLS: the action
  // above could be telling the truth for the wrong reason.
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`delete from public.report_top_items
                       where workspace_id = '${WS}' and month = '${AUG}'`),
      LOCKED,
    );
  });

  const [still] = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(still.c, 1);
});

test("a figure cannot be deleted on any month, published or not", async () => {
  // Worth writing down rather than assuming, because it is why the guard's
  // delete branch looks redundant on two of its three tables: **neither
  // `report_values` nor `report_notes` has a delete policy for anybody but
  // an admin.** A delete from either matches no row under RLS, which is
  // not an error — the silent no-op that made `saveTopItems` read back
  // what it removed.
  //
  // The trigger still covers the verb on all three. A delete policy added
  // later would otherwise reopen the hole without anybody touching the
  // guard, which is exactly how the top-items one nearly shipped alone.
  const before = await rows(`
    select count(*)::int c from public.report_values where workspace_id = '${WS}'`);

  await asMember(db, ELIZE, async () => {
    const r = await db.query(`delete from public.report_values
                               where workspace_id = '${WS}' and month = '${AUG}'`);
    assert.equal(r.affectedRows ?? 0, 0, "matched nothing, and said nothing");
  });

  const after = await rows(`
    select count(*)::int c from public.report_values where workspace_id = '${WS}'`);
  assert.equal(after[0].c, before[0].c);
});

test("the editor cannot drag a figure out of a published month into a draft one", async () => {
  // The column-ownership trap in its other shape: the update policy admits
  // the row, so the key columns are in play as much as the value. Moving
  // August's figure to September empties a report the client has read
  // without ever writing to a published month's `new` row.
  const [row] = await rows(`
    select id from public.report_values
     where workspace_id = '${WS}' and month = '${AUG}'
       and metric_key = 'financials_fixed_costs'`);

  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () => db.query(`update public.report_values set month = '${SEP}' where id = '${row.id}'`),
      LOCKED,
    );
  });
  assert.equal(await figure(), 300);
});

test("the editor cannot move a target on a published month", async () => {
  // A target is client-visible on a published month: §7's bar reads "4 of
  // 10 — 40%" and the panel says "is at 40% of your target". Moving it
  // after publication rewrites how the client's own figures read, without
  // touching a figure.
  const result = await as(ELIZE, () =>
    saveTargets(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        "target:financials_fixed_costs": 250,
        "scope:financials_fixed_costs": "month",
      }),
    ),
  );
  assert.match(result?.error ?? "", LOCKED);

  const rows_ = await rows(`
    select count(*)::int c from public.report_targets
     where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(rows_[0].c, 0, "nothing was set");
});

test("nor clear one — which an editor could not do at all until now", async () => {
  // Two things at once, so they are not confused. `saveTargets` clears an
  // emptied box with a delete, and report_targets had no delete policy, so
  // clearing was admin-only by accident. The policy ships in this
  // migration; the guard is what makes that safe.
  await as(NINA, () =>
    saveTargets(
      null,
      form({
        workspace_id: WS,
        month: SEP,
        "target:financials_fixed_costs": 400,
        "scope:financials_fixed_costs": "month",
      }),
    ),
  );

  // September is a draft, so Elize may clear it — the new policy at work.
  const cleared = await as(ELIZE, () =>
    saveTargets(
      null,
      form({
        workspace_id: WS,
        month: SEP,
        "target:financials_fixed_costs": "",
        "scope:financials_fixed_costs": "month",
      }),
    ),
  );
  assert.equal(cleared?.error, undefined, cleared?.error);
  const after = await rows(`
    select count(*)::int c from public.report_targets
     where workspace_id = '${WS}' and month = '${SEP}'`);
  assert.equal(after[0].c, 0, "the delete policy is really there");
});

test("a STANDING target is not locked, and that is a known hole", async () => {
  // It belongs to no month, so a month-keyed guard cannot reach it — and
  // one that refused it whenever ANY month was published would make
  // targets uneditable forever after the first report went out.
  //
  // It does move the bar on every published month without a target of its
  // own. That is for the carried-figure freeze to close, by storing what a
  // month was published with. Written down here so the hole is a decision
  // somebody can find, not a gap somebody assumes was covered.
  const result = await as(ELIZE, () =>
    saveTargets(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        "target:financials_fixed_costs": 275,
        "scope:financials_fixed_costs": "standing",
      }),
    ),
  );
  assert.equal(result?.error, undefined, result?.error);

  const [standing] = await rows(`
    select target_value::float v from public.report_targets
     where workspace_id = '${WS}' and month is null
       and metric_key = 'financials_fixed_costs'`);
  assert.equal(standing.v, 275);
});

// --- the client ------------------------------------------------------------

test("the client cannot write figures, published or not — unchanged", async () => {
  // Their refusal never depended on publication and does not now. The
  // wording is still the one §2 gives them, not the lock's.
  const refused = await saveFigure(CLIENT, { value: 1 });
  assert.match(refused?.error ?? "", /filled in by your strategist/);
});

test("the client CAN still reply to a published month, and reword their reply", async () => {
  // The whole point of publishing. A blanket lock on report_notes would
  // have deleted §8's conversation, which is why the guard carves out
  // client_reply by name.
  const sent = await as(CLIENT, () =>
    addClientReply(null, form({ workspace_id: WS, month: AUG, body: "Can we talk about the costs?" })),
  );
  assert.equal(sent?.error, undefined, sent?.error);

  const [reply] = await rows(`
    select id, body from public.report_notes
     where workspace_id = '${WS}' and month = '${AUG}' and note_type = 'client_reply'`);
  assert.equal(reply.body, "Can we talk about the costs?");

  const reworded = await as(CLIENT, () =>
    editClientReply(null, form({ note_id: reply.id, body: "Can we talk about the fixed costs?" })),
  );
  assert.equal(reworded?.error, undefined, reworded?.error);

  const [after] = await rows(`select body from public.report_notes where id = '${reply.id}'`);
  assert.equal(after.body, "Can we talk about the fixed costs?");
});

test("a reply cannot be smuggled in as a strategist note", async () => {
  // The carve-out is by note_type, so it is worth asking what happens when
  // somebody claims a different one. Two things refuse this, and the order
  // is worth knowing: a BEFORE trigger runs ahead of the policy's WITH
  // CHECK, so on a published month the lock answers first and RLS never
  // gets asked. `report_notes_write` would refuse it anyway — its CASE
  // gives a strategist note to `report_is_team` alone.
  await asMember(db, CLIENT, async () => {
    await assert.rejects(
      () => db.query(`
        insert into public.report_notes
          (workspace_id, month, note_type, author_id, author_name, body)
        values ('${WS}', '${AUG}', 'strategist', '${CLIENT}', 'Bella', 'Not mine to write')`),
      LOCKED,
    );
  });

  // And on a month with no lock on it, RLS is what refuses — so the
  // carve-out has not opened a second door into the strategist's half.
  await asMember(db, CLIENT, async () => {
    await assert.rejects(
      () => db.query(`
        insert into public.report_notes
          (workspace_id, month, note_type, author_id, author_name, body)
        values ('${WS}', '${SEP}', 'strategist', '${CLIENT}', 'Bella', 'Not mine to write')`),
      /row-level security|policy/i,
    );
  });

  const notes = await rows(`
    select count(*)::int c from public.report_notes
     where workspace_id = '${WS}' and note_type = 'strategist'`);
  assert.equal(notes[0].c, 1, "still only the one Nina wrote");
});

test("the editor cannot change the objectives on a published month", async () => {
  // "What we're focusing on next month" is §8's up-to-three objectives,
  // and they are on the client's Overview. They live in report_notes as
  // note_type = 'objective', so the lock covers them — the carve-out is
  // client_reply alone. Asserted rather than assumed, because "it is the
  // same table" is exactly the reasoning that misses one.
  const result = await as(ELIZE, () =>
    saveObjectives(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        "objective_1": "Actually, something else entirely",
      }),
    ),
  );
  assert.match(result?.error ?? "", LOCKED);

  const objectives = await rows(`
    select count(*)::int c from public.report_notes
     where workspace_id = '${WS}' and month = '${AUG}' and note_type = 'objective'`);
  assert.equal(objectives[0].c, 0, "none were written");
});

test("an editor cannot put words in the client's mouth — in any month", async () => {
  // Dom's question, 7 October: the guard lets a client_reply through on a
  // published month, so does anything stop ELIZE writing one?
  //
  // Until 20261007110000, no. `author_id` is pinned to the writer, so she
  // could not claim the client's user id — but `author_name` is free text
  // and it is what `replies.tsx` prints. A reply signed "Bella Rossi"
  // landed on the client's own published report.
  for (const month of [AUG, SEP]) {
    await asMember(db, ELIZE, async () => {
      await assert.rejects(
        () => db.query(`
          insert into public.report_notes
            (workspace_id, month, note_type, author_id, author_name, body)
          values ('${WS}', '${month}', 'client_reply', '${ELIZE}',
                  'Bella Rossi', 'Happy with everything, no notes!')`),
        /row-level security|policy/i,
        `a team member authored a client reply on ${month}`,
      );
    });
  }

  // Published or draft, nothing of hers is in the thread.
  const forged = await rows(`
    select count(*)::int c from public.report_notes
     where note_type = 'client_reply' and author_id = '${ELIZE}'`);
  assert.equal(forged[0].c, 0);
});

test("and the real client is unaffected — the policy narrowed, it did not close", async () => {
  // The mutation test for the line above: tighten it wrongly and this is
  // what breaks. The client's reply from earlier is still theirs, and they
  // can still send another.
  const sent = await as(CLIENT, () =>
    addClientReply(null, form({ workspace_id: WS, month: AUG, body: "One more thing." })),
  );
  assert.equal(sent?.error, undefined, sent?.error);

  const mine = await rows(`
    select count(*)::int c from public.report_notes
     where note_type = 'client_reply' and author_id = '${CLIENT}'`);
  assert.equal(mine[0].c, 2);
});

test("Elize's own half of the conversation still works", async () => {
  // §8: her reply to a client is the strategist's note, not a note in
  // their voice. On a draft month, she writes it as she always could.
  const note = await as(ELIZE, () =>
    saveStrategistNote(null, form({ workspace_id: WS, month: SEP, body: "On the costs: here is why." })),
  );
  assert.equal(note?.error, undefined, note?.error);
});

// --- the admin -------------------------------------------------------------

test("the admin passes the guard, as every guard in this codebase lets her", async () => {
  // Not an endorsement of editing a published month by hand — her screens
  // are read-only with everyone else's. It is that the person who can
  // unpublish does not need a fence, and that a guard which locked out the
  // only person who can undo the lock would be a trap.
  const result = await saveFigure(NINA, { value: 350 });
  assert.equal(result?.error, undefined, result?.error);
  assert.equal(await figure(), 350);

  // Put it back, so the round trip below starts where it should.
  await saveFigure(NINA, { value: 300 });
});

test("the service role passes too — it has no JWT and is not an admin", async () => {
  // The trap this codebase has fallen into twice: `is_portal_admin()` is
  // false for the service role because `auth.uid()` is null, so a guard
  // admitting only admins refuses the publish email and the cron.
  await asService(async () => {
    await db.query(`
      update public.report_values set value = 301
       where workspace_id = '${WS}' and month = '${AUG}'
         and metric_key = 'financials_fixed_costs'`);
  });
  assert.equal(await figure(), 301);
  await saveFigure(NINA, { value: 300 });
});

// --- self-serve ------------------------------------------------------------

test("a self-serve month is never locked, even with published_at set", async () => {
  // Publishing is a retainer concept. A self-serve client is also their own
  // editor, so an unscoped lock would shut them out of their own figures
  // with an unpublish button that is admin-only and that they never see.
  // Set directly, because the UI gives them no way to publish at all.
  await asService(async () => {
    await db.query(`
      insert into public.report_periods (workspace_id, month, published_at, published_by)
      values ('${SELF}', '${AUG}', now(), '${NINA}')
      on conflict (workspace_id, month)
        do update set published_at = now(), published_by = '${NINA}' `);
  });

  const [locked] = await rows(
    `select public.report_month_is_locked('${SELF}', '${AUG}') as l`,
  );
  assert.equal(locked.l, false, "a published aos_member month is still not locked");

  const result = await saveFigure(MEMBER, { workspace: SELF, value: 120 });
  assert.equal(result?.error, undefined, result?.error);
  assert.equal(await figure(SELF), 120);
});

// --- the way through -------------------------------------------------------

test("unpublish -> fix -> republish works end to end", async () => {
  // A lock with no route through it is a bug report waiting to be filed.
  // This is the route, and it is the only one.
  const back = await as(NINA, () => unpublishMonth(null, form({ workspace_id: WS, month: AUG })));
  assert.equal(back?.error, undefined, back?.error);
  const [mid] = await rows(`select published_at, email_sent_at from public.report_periods
                             where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.equal(mid.published_at, null, "back to draft");
  assert.ok(mid.email_sent_at, "and the record of the first send is kept, which is what makes the next one a correction");

  // Elize can work again, in all three verbs that were refused above.
  assert.equal((await saveFigure(ELIZE, { value: 450 }))?.error, undefined);
  assert.equal((await saveHook(ELIZE, { body: "The corrected one", views: 50 }))?.error, undefined);
  assert.equal(
    (await as(ELIZE, () =>
      saveStrategistNote(null, form({ workspace_id: WS, month: AUG, body: "Corrected: the costs were wrong." })),
    ))?.error,
    undefined,
  );

  const again = await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: AUG })));
  assert.equal(again?.error, undefined, again?.error);
  await flushAfter();
  // The second time out says so — a client reading a changed figure should
  // know it changed (Nina, 5 October). This is the half of Dom's decision
  // that is not a refusal: the route through the lock tells the client.
  assert.match(again?.notice ?? "", /updated/i);
  const [after] = await rows(`select email_sent_at from public.report_periods
                               where workspace_id = '${WS}' and month = '${AUG}'`);
  assert.ok(after.email_sent_at, "and emailed again");

  assert.equal(await figure(), 450);
  // And it is shut again behind her.
  assert.match((await saveFigure(ELIZE, { value: 1 }))?.error ?? "", LOCKED);
});

test("the client's reply survived the correction", async () => {
  // Rule 7, in the place it would be easiest to lose: unpublishing and
  // republishing must not take the conversation with it.
  const replies = await rows(`
    select body from public.report_notes
     where workspace_id = '${WS}' and month = '${AUG}' and note_type = 'client_reply'
     order by created_at`);
  assert.equal(replies.length, 2, "both of theirs, and nothing of anybody else's");
  assert.equal(replies[0].body, "Can we talk about the fixed costs?");
});

test("a draft month was never affected by any of this", async () => {
  // The lock keys on publication, so September — never published — behaves
  // exactly as it did before the migration.
  assert.equal((await saveFigure(ELIZE, { month: SEP, value: 42 }))?.error, undefined);
  assert.equal(await figure(WS, SEP), 42);
});
