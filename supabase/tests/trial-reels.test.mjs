/**
 * Trial Reels (§5.3) — the two lists, and what makes one Proven.
 *
 * The figures are month-level, so the generic entry screen already
 * handles them and `calculate` already works them out. What needed
 * building is the part that is words rather than numbers: the top three
 * hooks and the top three b-roll clips, and the marker for anything that
 * reaches the top three in two different months.
 *
 * §5.3's other note — a healthy profile-visit rate with a follow rate
 * below benchmark — is deliberately absent until benchmarks exist.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveTopItems } = await import("../../src/lib/reporting/top-item-actions.ts");
const { getTopItems } = await import("../../src/lib/reporting/queries.ts");
const { provenness } = await import("../../src/lib/reporting/top-items.ts");
const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const JUL = "2026-07-01";
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
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JUL}')).id as id`)
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

const saveHooks = (uid, month, hooks) =>
  as(uid, () =>
    saveTopItems(
      null,
      form({
        workspace_id: WS,
        month,
        ...Object.fromEntries(
          hooks.flatMap((h, i) => [
            [`item:hook:${i + 1}:body`, h.body],
            [`item:hook:${i + 1}:views`, h.views ?? ""],
          ]),
        ),
      }),
    ),
  );

test("the three hooks save, with their views", async () => {
  const result = await saveHooks(NINA, JUL, [
    { body: "The one thing nobody tells you", views: 40000 },
    { body: "Stop doing this", views: 22000 },
    { body: "Three minutes that changed it", views: 9000 },
  ]);
  assert.equal(result?.error, undefined, result?.error);

  const stored = await rows(`
    select rank, body, views from public.report_top_items
     where workspace_id = '${WS}' and month = '${JUL}' and item_type = 'hook'
     order by rank`);
  assert.deepEqual(
    stored.map((r) => [Number(r.rank), r.body, Number(r.views)]),
    [
      [1, "The one thing nobody tells you", 40000],
      [2, "Stop doing this", 22000],
      [3, "Three minutes that changed it", 9000],
    ],
  );
});

test("the database refuses a fourth, so the form's three are the table's three", async () => {
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () =>
        db.query(`
          insert into public.report_top_items (workspace_id, month, item_type, rank, body)
          values ('${WS}', '${JUL}', 'hook', 4, 'A fourth')`),
      /rank_range|violates check/i,
    );
  });
});

test("a hook in its second month is Proven, and says how many", async () => {
  await saveHooks(NINA, AUG, [
    { body: "stop doing this", views: 51000 },
    { body: "A brand new one", views: 12000 },
  ]);

  configure(db, NINA);
  const { thisMonth, history } = await getTopItems(WS, AUG);

  const repeated = thisMonth.find((i) => i.rank === 1);
  const fresh = thisMonth.find((i) => i.rank === 2);

  assert.deepEqual(provenness(repeated, history), { proven: true, months: 2 });
  assert.deepEqual(provenness(fresh, history), { proven: false, months: 1 });
});

test("clearing a line removes it", async () => {
  const result = await saveHooks(NINA, AUG, [
    { body: "stop doing this", views: 51000 },
    { body: "", views: "" },
  ]);
  assert.equal(result?.error, undefined, result?.error);

  const stored = await rows(`
    select rank from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}' and item_type = 'hook' order by rank`);
  assert.deepEqual(stored.map((r) => Number(r.rank)), [1], "the second line is gone");
});

test("an assigned team member can clear one too", async () => {
  // Until 6 Oct there was no delete policy for an editor, so this was
  // refused in silence — the action said "Saved" and the line stayed.
  await saveHooks(ELIZE, AUG, [
    { body: "stop doing this", views: 51000 },
    { body: "Elize's line", views: 100 },
  ]);
  const added = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}' and item_type = 'hook'`);
  assert.equal(added[0].c, 2);

  const result = await saveHooks(ELIZE, AUG, [
    { body: "stop doing this", views: 51000 },
    { body: "", views: "" },
  ]);
  assert.equal(result?.error, undefined, result?.error);

  const after = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and month = '${AUG}' and item_type = 'hook'`);
  assert.equal(after[0].c, 1, "and it actually went");
});

test("hooks and b-roll are kept apart, even word for word", async () => {
  await as(NINA, () =>
    saveTopItems(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        "item:b_roll:1:body": "stop doing this",
        "item:b_roll:1:views": 500,
      }),
    ),
  );

  configure(db, NINA);
  const { thisMonth, history } = await getTopItems(WS, AUG);
  const bRoll = thisMonth.find((i) => i.item_type === "b_roll");

  assert.equal(provenness(bRoll, history).months, 1, "a b-roll is not a hook");
});

test("the client reads them only once the month is published", async () => {
  configure(db, CLIENT);
  const draft = await getTopItems(WS, AUG);
  assert.equal(draft.thisMonth.length, 0, "a draft month's lists are not theirs");

  await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: AUG })));

  configure(db, CLIENT);
  const published = await getTopItems(WS, AUG);
  assert.ok(published.thisMonth.length > 0);
  assert.ok(
    published.thisMonth.every((i) => i.month === AUG),
    "and July is still a draft, so it is not in their history",
  );
});

test("the client cannot write one", async () => {
  const refused = await saveHooks(CLIENT, AUG, [{ body: "Mine now", views: 1 }]);
  assert.match(refused?.error ?? "", /filled in by your strategist/);

  const stored = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and body = 'Mine now'`);
  assert.equal(stored[0].c, 0);
});

test("a refused clear is reported, not called a save", async () => {
  // Reachable only without the delete policy, which is the state live
  // was in until 6 October — and the reason the action reads back what
  // went instead of trusting that a delete with no error removed
  // something. Dropped here so the branch is exercised rather than
  // merely written.
  await saveHooks(ELIZE, JUL, [
    { body: "The one thing nobody tells you", views: 40000 },
    { body: "Elize's second", views: 10 },
  ]);

  await db.exec(`drop policy report_top_items_delete_editors on public.report_top_items`);
  let result;
  try {
    result = await saveHooks(ELIZE, JUL, [
      { body: "The one thing nobody tells you", views: 40000 },
      { body: "", views: "" },
    ]);
  } finally {
    await db.exec(`
      create policy report_top_items_delete_editors
        on public.report_top_items for delete to authenticated
        using (public.report_can_edit(workspace_id))`);
  }

  assert.match(result?.error ?? "", /needs an admin/);
  assert.equal(result?.notice, undefined, "and it does not also say Saved");

  const still = await rows(`
    select count(*)::int c from public.report_top_items
     where workspace_id = '${WS}' and month = '${JUL}' and body = 'Elize''s second'`);
  assert.equal(still[0].c, 1, "the line really is still there, which is why it must say so");
});
