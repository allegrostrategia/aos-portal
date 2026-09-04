/**
 * Peer pairing, driven through the app's own matching action.
 *
 * The matcher itself is covered as a pure function; this covers everything
 * around it — who is eligible, who the coach is, what actually lands in the
 * database, and which notification jobs get queued for whom.
 *
 * That last part is the reason this exists. The pairing emails have no other
 * test: their handlers read from `due_jobs`, and a job queued for the wrong
 * person, or not queued at all, produces exactly the same silence as a working
 * system until somebody notices they were never told.
 */
import test from "node:test";
import assert from "node:assert/strict";
// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { runMatching } = await import("../../src/lib/admin/pairing-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const DOM = "22222222-2222-2222-2222-222222222222";
const RUTH = "33333333-3333-3333-3333-333333333333";
const OMAR = "44444444-4444-4444-4444-444444444444";
const IVY = "55555555-5555-5555-5555-555555555555";
const MONTH = "2026-11";
const MONTH_FIRST = "2026-11-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${DOM}','dom@test'),
    ('${RUTH}','ruth@test'), ('${OMAR}','omar@test'), ('${IVY}','ivy@test');
  insert into public.members (id, email, full_name, role, status, is_coach) values
    ('${NINA}','nina@allegro.test','Nina','admin','active', true),
    ('${DOM}','dom@test','Dom','admin','active', false);
`);

await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [RUTH, "ruth@test", "Ruth Bell"],
    [OMAR, "omar@test", "Omar Diaz"],
    [IVY, "ivy@test", "Ivy Chen"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
  }
  await db.query(`select public.activate_member('${RUTH}')`);
  await db.query(`select public.activate_member('${OMAR}')`);
  // Ivy stays in onboarding: §1 locks pairing until active.
});

await asMember(db, RUTH, () => db.query(`
  insert into public.pairing_availability (member_id, pairing_month, availability, submitted_at)
  values ('${RUTH}','${MONTH_FIRST}','{"slots":["tue-pm","thu-am"]}'::jsonb, now())`));
await asMember(db, OMAR, () => db.query(`
  insert into public.pairing_availability (member_id, pairing_month, availability, submitted_at)
  values ('${OMAR}','${MONTH_FIRST}','{"slots":["tue-pm"]}'::jsonb, now())`));

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const jobs = async (kind) =>
  (await db.query(
    `select member_id, due_on::text, payload from public.due_jobs
     where kind = '${kind}' order by member_id`,
  )).rows;

test("a member cannot run the matching", async () => {
  configure(db, RUTH);
  await assert.rejects(
    () => runMatching(null, form({ pairing_month: MONTH })),
    /REDIRECT:\/piazza/,
  );
});

test("matching pairs the active members and says so", async () => {
  configure(db, NINA);
  const result = await runMatching(null, form({ pairing_month: MONTH }));

  assert.equal(result?.error, undefined);
  assert.match(result?.notice ?? "", /1 pairing made/);

  const rows = await db.query(
    `select count(*)::int c from public.pairings where pairing_month = '${MONTH_FIRST}'`,
  );
  assert.equal(rows.rows[0].c, 1);
});

test("the onboarding member is left out — pairing is locked until active", async () => {
  const rows = await db.query(
    `select member_id from public.pairing_participants where pairing_month = '${MONTH_FIRST}'`,
  );
  const ids = rows.rows.map((r) => r.member_id).sort();
  assert.deepEqual(ids, [RUTH, OMAR].sort());
  assert.ok(!ids.includes(IVY));
});

test("the second admin isn't quietly pairable either", async () => {
  const rows = await db.query(
    `select count(*)::int c from public.pairing_participants
     where pairing_month = '${MONTH_FIRST}' and member_id = '${DOM}'`,
  );
  assert.equal(rows.rows[0].c, 0);
});

// The half with no other test: the emails are queued jobs, and a job for the
// wrong person looks exactly like a working system until somebody isn't told.
test("both members are queued a booked-in notification, and nobody else", async () => {
  const booked = await jobs("pairing_booked");
  assert.deepEqual(booked.map((j) => j.member_id).sort(), [RUTH, OMAR].sort());
});

test("the booked-in job carries the pairing it's about", async () => {
  const [{ payload }] = await jobs("pairing_booked");
  const pairing = await db.query(
    `select id from public.pairings where pairing_month = '${MONTH_FIRST}'`,
  );
  assert.equal(payload.pairing_id, pairing.rows[0].id);
});

test("the day-7 flag is queued to the admin, a week out, one per pairing", async () => {
  const dayseven = await jobs("pairing_day7");
  assert.equal(dayseven.length, 1);
  assert.equal(dayseven[0].member_id, NINA);

  const due = new Date(dayseven[0].due_on);
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  assert.ok(days >= 6 && days <= 7, `due in ${days} days`);
});

test("running the same month again is refused rather than re-pairing", async () => {
  configure(db, NINA);
  const result = await runMatching(null, form({ pairing_month: MONTH }));

  assert.match(result?.error ?? "", /already matched/);
  const rows = await db.query(
    `select count(*)::int c from public.pairings where pairing_month = '${MONTH_FIRST}'`,
  );
  assert.equal(rows.rows[0].c, 1);
});

test("an odd month pairs the spare with the coach, not with the other admin", async () => {
  configure(db, NINA);
  await asMember(db, NINA, () => db.query(`select public.activate_member('${IVY}')`));

  const result = await runMatching(null, form({ pairing_month: "2026-12" }));
  assert.equal(result?.error, undefined);
  assert.match(result?.notice ?? "", /with the coach/);

  const coachPairing = await db.query(`
    select p.id from public.pairings p
    join public.pairing_participants pp on pp.pairing_id = p.id
    where p.pairing_month = '2026-12-01' and pp.member_id = '${NINA}'`);
  assert.equal(coachPairing.rows.length, 1);

  const domPaired = await db.query(`
    select count(*)::int c from public.pairing_participants
    where pairing_month = '2026-12-01' and member_id = '${DOM}'`);
  assert.equal(domPaired.rows[0].c, 0);
});

test("with no coach flagged, the spare is left out and the notice explains", async () => {
  await db.query(`update public.members set is_coach = false where id = '${NINA}'`);

  configure(db, NINA);
  const result = await runMatching(null, form({ pairing_month: "2027-01" }));

  assert.match(result?.notice ?? "", /1 left unmatched/);
  assert.match(result?.notice ?? "", /nobody is marked as the coach/);

  const rows = await db.query(
    `select count(*)::int c from public.pairings where pairing_month = '2027-01-01'`,
  );
  assert.equal(rows.rows[0].c, 1);
});
