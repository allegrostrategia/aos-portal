/**
 * The week-away-from-La-Strada nudge (round 6 §2).
 *
 * Everything here is about who it reaches, because that is the half that
 * fails quietly: a nudge sent to someone who was in yesterday reads as the
 * product not paying attention, and one never sent to someone who has
 * drifted is the whole feature missing.
 *
 * "Interacted" is the latest of three marks — opening the page, ticking an
 * action, writing a month note — so each is given its own member.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { sent, reset as resetEmail } from "./stubs/email-send.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.test";

const { planRoadmapIdle, runRoadmapIdle } = await import("../../src/lib/jobs/runner.ts");
const { createAdminClient } = await import("./stubs/supabase-admin.mjs");

const NINA = "11111111-1111-1111-1111-111111111111";
const AWAY = "22222222-2222-2222-2222-222222222222";
const VISITED = "33333333-3333-3333-3333-333333333333";
const TICKED = "44444444-4444-4444-4444-444444444444";
const NOTED = "55555555-5555-5555-5555-555555555555";
const NO_ROADMAP = "66666666-6666-6666-6666-666666666666";

const db = await createTestDatabase();
configure(db, null);

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@test'), ('${AWAY}','away@test'), ('${VISITED}','visited@test'),
    ('${TICKED}','ticked@test'), ('${NOTED}','noted@test'), ('${NO_ROADMAP}','none@test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@test','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [AWAY, "away@test", "Ada Away"],
    [VISITED, "visited@test", "Vic Visited"],
    [TICKED, "ticked@test", "Tom Ticked"],
    [NOTED, "noted@test", "Nell Noted"],
    [NO_ROADMAP, "none@test", "Nora None"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
});

// A published roadmap each, except Nora.
const ACTION = "a1a1a1a1-1111-2222-3333-444444444444";
const phases = JSON.stringify([
  { month: 1, title: "Systems", focuses: [{ id: "f1", title: "Follow-up", actions: [{ id: ACTION, label: "Rebuild the follow-up" }] }] },
]);
for (const id of [AWAY, VISITED, TICKED, NOTED]) {
  await db.query(`
    insert into public.roadmap (member_id, phases, reason, is_current, confirmed_at)
    values ('${id}', '${phases}'::jsonb, 'onboarding', true, now() - interval '60 days')`);
}

const roadmapOf = async (memberId) =>
  (await db.query(`select id from public.roadmap where member_id = '${memberId}'`)).rows[0].id;

const LONG_AGO = "now() - interval '30 days'";

// Ada: opened it a month ago and not since.
await db.query(`
  insert into public.roadmap_seen (member_id, last_seen_at) values ('${AWAY}', ${LONG_AGO})`);
// Vic: opened it yesterday.
await db.query(`
  insert into public.roadmap_seen (member_id, last_seen_at)
  values ('${VISITED}', now() - interval '1 day')`);
// Tom: hasn't opened it in a month, but ticked an action yesterday.
await db.query(
  `insert into public.roadmap_seen (member_id, last_seen_at) values ('${TICKED}', ${LONG_AGO})`,
);
await db.query(`
  insert into public.roadmap_action_ticks (roadmap_id, member_id, action_id, done, updated_at)
  values ('${await roadmapOf(TICKED)}', '${TICKED}', '${ACTION}', true, now() - interval '1 day')`);
// Nell: hasn't opened it, but wrote a month note yesterday.
await db.query(
  `insert into public.roadmap_seen (member_id, last_seen_at) values ('${NOTED}', ${LONG_AGO})`,
);
await db.query(`
  insert into public.roadmap_month_notes (roadmap_id, member_id, month, body, updated_at)
  values ('${await roadmapOf(NOTED)}', '${NOTED}', 1, 'Did this off-plan instead.', now() - interval '1 day')`);

const admin = createAdminClient();
const today = new Date().toISOString().slice(0, 10);

test.beforeEach(() => resetEmail());

test("it reaches the member who has been away, and nobody who has been in", async () => {
  await planRoadmapIdle(today);

  const queued = await db.query(
    `select member_id from public.due_jobs where kind = 'roadmap_idle'`,
  );
  const ids = queued.rows.map((r) => r.member_id).sort();
  assert.deepEqual(ids, [AWAY].sort(), "only Ada; a tick and a note are being in too");
});

test("a member with no published roadmap isn't nudged toward an empty page", async () => {
  const queued = await db.query(
    `select count(*)::int c from public.due_jobs
     where kind = 'roadmap_idle' and member_id = '${NO_ROADMAP}'`,
  );
  assert.equal(queued.rows[0].c, 0);
});

test("the nudge is one a week, not one a morning", async () => {
  await planRoadmapIdle(today);
  const queued = await db.query(
    `select count(*)::int c from public.due_jobs where kind = 'roadmap_idle'`,
  );
  assert.equal(queued.rows[0].c, 1, "the same week's key is the same job");
});

test("it says what Nina wrote, and offers the way out", async () => {
  const outcome = await runRoadmapIdle(admin, { member_id: AWAY });

  assert.equal(outcome, "sent");
  assert.equal(sent()[0].to, "away@test");
  assert.match(sent()[0].text, /Ada,/);
  assert.match(sent()[0].text, /haven't been in for about a week/);
  assert.match(sent()[0].text, /If you're just having a busy week, no worries/);
  assert.match(sent()[0].text, /https:\/\/aos\.test\/roadmap/);
  // No day count, no tally of how many times they've been told.
  assert.doesNotMatch(sent()[0].text, /\b\d+ days\b/);
});

// The gap that matters: planned at 08:00, sent later, and the member opened
// La Strada in between.
test("opening it between the planning and the send cancels the send", async () => {
  await db.query(`
    update public.roadmap_seen set last_seen_at = now() where member_id = '${AWAY}'`);

  const outcome = await runRoadmapIdle(admin, { member_id: AWAY });
  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
});

test("a member who turned reminders off doesn't get this one either", async () => {
  await db.query(`
    update public.roadmap_seen set last_seen_at = now() - interval '30 days'
    where member_id = '${AWAY}'`);
  await db.query(
    `update public.members set notify_reminders = false where id = '${AWAY}'`,
  );

  const outcome = await runRoadmapIdle(admin, { member_id: AWAY });
  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
});
