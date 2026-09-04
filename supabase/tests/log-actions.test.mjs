/**
 * The weekly log's actions-taken checklist.
 *
 * Two bugs found by hand on 3 Sep, both about a tick not surviving a refresh:
 * nothing was saved until sign-off, and the form never rendered what had been
 * saved. §4 asks for "logged as you go, signed off at the end" and the schema
 * was built for it — `submitted_at` is nullable and the update policy permits
 * edits only while it is null — so a draft row was always the intended shape.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveLogDraft, submitWeeklyLog } = await import(
  "../../src/lib/log/actions.ts"
);
// Both actions take the week from the clock rather than the form — one source
// of truth — so the test has to use the same week they will.
const { currentWeekStart } = await import("../../src/lib/log/queries.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const WEEK = currentWeekStart();

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${RUTH}','ruth@test','Ruth Bell', now(), now())`);
  await db.query(`select public.activate_member('${RUTH}')`);
});

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const submission = async () =>
  (await db.query(
    `select actions_taken, submitted_at, other_activity from public.weekly_submissions
     where member_id = '${RUTH}' and week_start_date = '${WEEK}'`,
  )).rows[0];

// The bug as reported: tick, refresh, gone.
test("a tick is saved before the week is signed off", async () => {
  configure(db, RUTH);
  await saveLogDraft(form({ week_start: WEEK, "action:abc": "on" }));

  const row = await submission();
  assert.ok(row, "a draft row should exist");
  assert.deepEqual(row.actions_taken, { abc: true });
});

// Ticking a box is not signing off a week.
test("saving a draft does not submit the week", async () => {
  assert.equal((await submission()).submitted_at, null);
});

test("unticking removes it rather than leaving it set", async () => {
  configure(db, RUTH);
  await saveLogDraft(form({ week_start: WEEK, "action:def": "on" }));
  assert.deepEqual((await submission()).actions_taken, { def: true });
});

test("a draft carries every ticked action, not just the last one", async () => {
  configure(db, RUTH);
  await saveLogDraft(
    form({ week_start: WEEK, "action:abc": "on", "action:def": "on" }),
  );
  assert.deepEqual((await submission()).actions_taken, { abc: true, def: true });
});

test("signing off keeps what was ticked and dates it", async () => {
  configure(db, RUTH);
  const result = await submitWeeklyLog(
    null,
    form({
      week_start: WEEK,
      "action:abc": "on",
      "action:def": "on",
      other_activity: "Rewrote the onboarding email.",
    }),
  );

  assert.equal(result?.error, undefined);
  const row = await submission();
  assert.ok(row.submitted_at);
  assert.deepEqual(row.actions_taken, { abc: true, def: true });
  assert.equal(row.other_activity, "Rewrote the onboarding email.");
});

// A dated entry stays what it said.
test("a signed-off week can't be edited by a later draft save", async () => {
  configure(db, RUTH);
  await saveLogDraft(form({ week_start: WEEK, "action:xyz": "on" }));

  const row = await submission();
  assert.deepEqual(row.actions_taken, { abc: true, def: true });
});

test("nor by submitting again", async () => {
  configure(db, RUTH);
  const result = await submitWeeklyLog(null, form({ week_start: WEEK }));
  assert.match(result?.error ?? "", /already in/);
});

// One source of truth for the week: the form can't send the ticks to a
// different row than the sign-off will write to.
test("a week sent by the page is ignored — the clock decides", async () => {
  configure(db, RUTH);
  await saveLogDraft(form({ week_start: "1999-01-04", "action:abc": "on" }));

  const rows = await db.query(
    `select count(*)::int c from public.weekly_submissions where member_id = '${RUTH}'`,
  );
  assert.equal(rows.rows[0].c, 1, "only the current week should ever exist");
});
