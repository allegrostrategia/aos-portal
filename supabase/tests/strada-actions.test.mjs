/**
 * La Strada, driven through the app's own Server Actions: Nina starts a
 * draft, fills it in, publishes; the member ticks and writes off-the-itinerary
 * notes; ids survive edits; RLS holds throughout. Replaces the old editor's
 * suite (roadmap-actions.test.mjs), whose whole-plan save is gone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const {
  startRoadmap, publishRoadmap, setStartsOn, setMonthTitle, upsertAction, deleteAction, setActionDone, saveMonthNote,
} = await import("../../src/lib/roadmap/strada-actions.ts");
const { saveActionNote } = await import("../../src/lib/roadmap/actions.ts");
const { getCurrentRoadmap, getStradaState, isDone } = await import("../../src/lib/roadmap/queries.ts");
const { getOnboardingProgress } = await import("../../src/lib/onboarding/progress.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const OMAR = "33333333-3333-3333-3333-333333333333";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test'), ('${OMAR}','omar@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  for (const [id, email, name] of [[RUTH, "ruth@test", "Ruth Bell"], [OMAR, "omar@test", "Omar Diaz"]]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
});

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}
const ruthRow = async () => (await db.query(
  `select id, phases, confirmed_at, starts_on::text from public.roadmap where member_id='${RUTH}' and is_current`)).rows[0];
const actions = (row) => row.phases.flatMap((m) => m.focuses.flatMap((f) => f.actions.map((a) => ({ ...a, month: m.month }))));
const ruth = async () => (await db.query(`select * from public.members where id='${RUTH}'`)).rows[0];

test("a member cannot start, edit or publish a roadmap: the admin gate sends them home", async () => {
  configure(db, RUTH);
  await assert.rejects(() => startRoadmap(form({ member_id: RUTH })), /REDIRECT/);
  await assert.rejects(() => upsertAction(null, form({ roadmap_id: "x", month: "1", label: "Nope" })), /REDIRECT/);
  assert.equal(await ruthRow(), undefined);
});

test("Nina starts a draft: month 1 begins the first Monday of next month; Ruth sees nothing", async () => {
  configure(db, NINA);
  await startRoadmap(form({ member_id: RUTH }));
  const row = await ruthRow();
  assert.ok(row);
  assert.equal(row.confirmed_at, null);
  assert.match(row.starts_on, /^\d{4}-\d{2}-\d{2}$/);
  const dow = new Date(`${row.starts_on}T12:00:00Z`).getUTCDay();
  assert.equal(dow, 1, "a Monday");

  configure(db, RUTH);
  const p = await getOnboardingProgress(await ruth());
  assert.equal(p.steps.find((s) => s.key === "roadmap").done, false, "a draft is not an arrival");
});

test("starting twice does nothing", async () => {
  configure(db, NINA);
  await startRoadmap(form({ member_id: RUTH }));
  assert.equal((await db.query(`select count(*)::int c from public.roadmap where member_id='${RUTH}'`)).rows[0].c, 1);
});

test("an empty draft cannot be published", async () => {
  configure(db, NINA);
  const result = await publishRoadmap(null, form({ roadmap_id: (await ruthRow()).id }));
  assert.match(result?.error ?? "", /at least one action/);
  assert.equal((await ruthRow()).confirmed_at, null);
});

test("a month's theme, an action in a week, and its bucket, save instantly", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  assert.equal(await setMonthTitle(null, form({ roadmap_id: id, month: "1", title: "Foundations" })), null);
  assert.equal(await upsertAction(null, form({
    roadmap_id: id, month: "1", week: "2", label: "Set the price", bucket: "launch",
  })), null);
  const row = await ruthRow();
  assert.equal(row.phases[0].title, "Foundations");
  const [a] = actions(row);
  assert.equal(a.label, "Set the price");
  assert.equal(a.week, 2);
  assert.equal(a.bucket, "launch");
  assert.equal(a.month, 1);
});

test("editing an action in place keeps its id, even reworded and moved to another week", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  const [before] = actions(await ruthRow());
  await upsertAction(null, form({
    roadmap_id: id, month: "1", week: "3", action_id: before.id, label: "Set the price and check the margin", bucket: "profit",
  }));
  const [after] = actions(await ruthRow());
  assert.equal(after.id, before.id);
  assert.equal(after.label, "Set the price and check the margin");
  assert.equal(after.week, 3);
  assert.equal(after.bucket, "profit");
});

test("moving an action to another month carries it across, id and all", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  const [a] = actions(await ruthRow());
  await upsertAction(null, form({ roadmap_id: id, month: "2", week: "1", action_id: a.id, label: a.label, bucket: "profit" }));
  const all = actions(await ruthRow());
  assert.equal(all.length, 1);
  assert.equal(all[0].id, a.id);
  assert.equal(all[0].month, 2);
  // Back to month 1 for the rest.
  await upsertAction(null, form({ roadmap_id: id, month: "1", week: "2", action_id: a.id, label: a.label, bucket: "launch" }));
});

test("publishing: Ruth's onboarding step ticks, and she can see the plan", async () => {
  configure(db, NINA);
  const result = await publishRoadmap(null, form({ roadmap_id: (await ruthRow()).id }));
  assert.equal(result?.error, undefined);
  assert.ok((await ruthRow()).confirmed_at);

  configure(db, RUTH);
  const p = await getOnboardingProgress(await ruth());
  assert.equal(p.steps.find((s) => s.key === "roadmap").done, true);
  const rm = await getCurrentRoadmap(RUTH);
  assert.equal(rm.months[0].title, "Foundations");
});

test("week 1's month can be moved; the date snaps to that month's first Monday", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  const result = await setStartsOn(null, form({ roadmap_id: id, starts_on: "2026-11-18" }));
  assert.equal(result?.error, undefined);
  assert.equal((await ruthRow()).starts_on, "2026-11-02");
});

test("Ruth ticks an action; the tick is hers and outlives the week", async () => {
  configure(db, RUTH);
  const id = (await ruthRow()).id;
  const [a] = actions(await ruthRow());
  assert.deepEqual(await setActionDone(id, a.id, true), { ok: true });
  const state = await getStradaState(id, RUTH);
  assert.equal(isDone(a.id, state), true);
});

test("a tick on La Strada overrides what the weekly log implies, both ways", async () => {
  configure(db, RUTH);
  const id = (await ruthRow()).id;
  const [a] = actions(await ruthRow());
  // The log says done (a signed-off week ticked it)...
  await asMember(db, RUTH, () => db.query(
    `insert into public.weekly_submissions (member_id, week_start_date, actions_taken, submitted_at)
     values ('${RUTH}', '2025-01-06', '{"${a.id}": true}', '2025-01-10 17:00Z')`));
  // ...and La Strada says not done: La Strada wins.
  await setActionDone(id, a.id, false);
  assert.equal(isDone(a.id, await getStradaState(id, RUTH)), false);
  // With no explicit tick, the log's word stands.
  await asMember(db, RUTH, () => db.query(`delete from public.roadmap_action_ticks where action_id='${a.id}'`));
  assert.equal(isDone(a.id, await getStradaState(id, RUTH)), true);
});

test("Omar cannot tick Ruth's action", async () => {
  configure(db, OMAR);
  const id = (await ruthRow()).id;
  const [a] = actions(await ruthRow());
  assert.deepEqual(await setActionDone(id, a.id, true), { ok: false });
  assert.equal((await db.query(`select count(*)::int c from public.roadmap_action_ticks where member_id='${OMAR}'`)).rows[0].c, 0);
});

test("Nina can tick on Ruth's behalf from edit mode, and it is recorded as Ruth's", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  const [a] = actions(await ruthRow());
  assert.deepEqual(await setActionDone(id, a.id, true), { ok: true });
  const row = (await db.query(`select member_id, done from public.roadmap_action_ticks where action_id='${a.id}'`)).rows[0];
  assert.equal(row.member_id, RUTH);
  assert.equal(row.done, true);
});

test("off the itinerary: Ruth writes, rewrites and clears a month's note; Nina reads it", async () => {
  configure(db, RUTH);
  const id = (await ruthRow()).id;
  assert.match((await saveMonthNote(null, form({ roadmap_id: id, month: "1", body: "Landed a referral client" })))?.notice ?? "", /Saved/);
  await saveMonthNote(null, form({ roadmap_id: id, month: "1", body: "Landed a referral client, and a second" }));
  assert.equal((await getStradaState(id, RUTH)).notes.get(1), "Landed a referral client, and a second");

  configure(db, NINA);
  assert.equal((await getStradaState(id, RUTH)).notes.get(1), "Landed a referral client, and a second");

  configure(db, RUTH);
  await saveMonthNote(null, form({ roadmap_id: id, month: "1", body: "  " }));
  assert.equal((await getStradaState(id, RUTH)).notes.get(1), undefined);
});

test("Nina cannot write Ruth's off-the-itinerary note: it's the member's account", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  const result = await saveMonthNote(null, form({ roadmap_id: id, month: "2", body: "Nina's words" }));
  assert.match(result?.error ?? "", /Couldn't save/);
});

test("a member's note on an action survives the action being edited", async () => {
  configure(db, RUTH);
  const id = (await ruthRow()).id;
  const [a] = actions(await ruthRow());
  await saveActionNote(null, form({ roadmap_id: id, action_id: a.id, body: "Priced it, felt low" }));

  configure(db, NINA);
  await upsertAction(null, form({ roadmap_id: id, month: "1", week: "2", action_id: a.id, label: "Set the price, properly", bucket: "launch" }));
  const note = (await db.query(`select body from public.roadmap_action_notes where action_id='${a.id}'`)).rows[0];
  assert.equal(note.body, "Priced it, felt low");
});

test("removing an action removes it", async () => {
  configure(db, NINA);
  const id = (await ruthRow()).id;
  await upsertAction(null, form({ roadmap_id: id, month: "1", week: "1", label: "Temporary" }));
  const temp = actions(await ruthRow()).find((a) => a.label === "Temporary");
  await deleteAction(form({ roadmap_id: id, action_id: temp.id }));
  assert.equal(actions(await ruthRow()).some((a) => a.id === temp.id), false);
});
