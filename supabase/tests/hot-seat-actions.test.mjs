/**
 * The hot seat prep sheet, driven through the app's own Server Actions.
 *
 * Same approach as `draw-actions.test.mjs`: the actions run unmodified, only
 * their surroundings are stubbed, and every query still goes through RLS as a
 * real signed-in member.
 *
 * The case worth the most here is the member who never submitted. Before this,
 * they had no submission row and so could not be prepped at all — which meant
 * §5's own fallback was unreachable for precisely the people it was written for.
 */
import test from "node:test";
import assert from "node:assert/strict";
// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { confirmChallenge, setAttendance, saveReplayNote } = await import(
  "../../src/lib/admin/hot-seat-actions.ts"
);
const { getSessionPrep } = await import("../../src/lib/admin/hot-seat-prep.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const WROTE = "22222222-2222-2222-2222-222222222222";
const SILENT = "33333333-3333-3333-3333-333333333333";
const SESSION = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}', 'nina@allegro.test'),
    ('${WROTE}', 'wrote@test'),
    ('${SILENT}', 'silent@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}', 'nina@allegro.test', 'Nina', 'admin', 'active');
`);

await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${WROTE}','wrote@test','Wren Oaks', now(), now())`);
  await db.query(`select public.create_member('${SILENT}','silent@test','Sil Ent', now(), now())`);
  await db.query(`select public.activate_member('${WROTE}')`);
  await db.query(`select public.activate_member('${SILENT}')`);
  await db.query(`
    insert into public.hot_seat_sessions (id, session_month, scheduled_for)
    values ('${SESSION}', '2026-02-01', '2026-02-04 10:00Z')`);
});

// Wren submits. Sil never does, but logs time — which is all §5 gives Nina to
// work from, and the whole reason they have to appear on the sheet at all.
await asMember(db, WROTE, () =>
  db.query(`
    insert into public.hot_seat_submissions
      (session_id, member_id, challenge, already_tried, done_looks_like, submitted_at)
    values ('${SESSION}', '${WROTE}', 'Enquiries eat my mornings',
            'A shared inbox', 'Replies go out without me', now())`),
);

await asMember(db, SILENT, () =>
  db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
      ('${SILENT}','finance-admin','2026-02-03 09:00Z','2026-02-03 17:00Z'),
      ('${SILENT}','social-media', '2026-02-05 09:00Z','2026-02-05 11:00Z')`),
);

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const submissionCount = async (memberId) =>
  (await db.query(
    `select count(*)::int c from public.hot_seat_submissions
     where session_id = '${SESSION}' and member_id = '${memberId}'`,
  )).rows[0].c;

test("the prep sheet lists every active member, not every submission", async () => {
  configure(db, NINA);
  const rows = await getSessionPrep(SESSION);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.fullName).sort(),
    ["Sil Ent", "Wren Oaks"],
  );
});

test("whoever submitted comes first", async () => {
  configure(db, NINA);
  const rows = await getSessionPrep(SESSION);

  assert.equal(rows[0].fullName, "Wren Oaks");
  assert.ok(rows[0].submittedAt);
  assert.equal(rows[1].submittedAt, null);
});

test("a non-submitter has no submission row to point at", async () => {
  assert.equal(await submissionCount(SILENT), 0);
  configure(db, NINA);
  const rows = await getSessionPrep(SESSION);
  assert.equal(rows.find((r) => r.memberId === SILENT).submissionId, null);
});

// The gap this work exists to close.
test("locking a challenge for a non-submitter creates their row", async () => {
  configure(db, NINA);
  const result = await confirmChallenge(
    null,
    form({
      session_id: SESSION,
      member_id: SILENT,
      confirmed_challenge: "Automate the month-end finance admin",
    }),
  );

  assert.equal(result?.error, undefined);
  assert.equal(await submissionCount(SILENT), 1);

  const row = (await db.query(
    `select confirmed_challenge, confirmed_by, drafted_by from public.hot_seat_submissions
     where member_id = '${SILENT}'`,
  )).rows[0];
  assert.equal(row.confirmed_challenge, "Automate the month-end finance admin");
  assert.equal(row.confirmed_by, NINA);
  assert.equal(row.drafted_by, "nina");
});

test("locking twice updates rather than duplicating", async () => {
  configure(db, NINA);
  const rows = await getSessionPrep(SESSION);
  const sil = rows.find((r) => r.memberId === SILENT);
  assert.ok(sil.submissionId, "row should exist by now");

  await confirmChallenge(
    null,
    form({
      submission_id: sil.submissionId,
      confirmed_challenge: "Automate month-end, starting with the invoices",
    }),
  );

  assert.equal(await submissionCount(SILENT), 1);
});

test("a blank challenge is refused — it's what goes into the room", async () => {
  configure(db, NINA);
  const result = await confirmChallenge(
    null,
    form({ session_id: SESSION, member_id: WROTE, confirmed_challenge: "   " }),
  );

  assert.match(result?.error ?? "", /can't be blank/);
});

test("taking the draft as written is recorded as Claude's, not Nina's", async () => {
  configure(db, NINA);
  await db.query(
    `update public.hot_seat_submissions set suggested_challenge = 'Draft text'
     where member_id = '${WROTE}'`,
  );
  const rows = await getSessionPrep(SESSION);
  const wren = rows.find((r) => r.memberId === WROTE);

  await confirmChallenge(
    null,
    form({
      submission_id: wren.submissionId,
      suggested_challenge: "Draft text",
      confirmed_challenge: "Draft text",
    }),
  );

  const row = (await db.query(
    `select drafted_by from public.hot_seat_submissions where member_id = '${WROTE}'`,
  )).rows[0];
  assert.equal(row.drafted_by, "claude");
});

test("attendance stays null until marked, so unmarked never reads as absent", async () => {
  configure(db, NINA);
  const rows = await getSessionPrep(SESSION);
  assert.equal(rows.find((r) => r.memberId === WROTE).attended, null);
});

test("marking attendance, and clearing it again", async () => {
  configure(db, NINA);
  const rows = await getSessionPrep(SESSION);
  const wren = rows.find((r) => r.memberId === WROTE);

  await setAttendance(null, form({ submission_id: wren.submissionId, attended: "yes" }));
  let after = await getSessionPrep(SESSION);
  assert.equal(after.find((r) => r.memberId === WROTE).attended, true);

  await setAttendance(null, form({ submission_id: wren.submissionId, attended: "no" }));
  after = await getSessionPrep(SESSION);
  assert.equal(after.find((r) => r.memberId === WROTE).attended, false);

  await setAttendance(null, form({ submission_id: wren.submissionId, attended: "" }));
  after = await getSessionPrep(SESSION);
  assert.equal(after.find((r) => r.memberId === WROTE).attended, null);
});

test("a member who turned up without submitting can still be marked", async () => {
  const NEW = "55555555-5555-5555-5555-555555555555";
  await db.exec(`insert into auth.users (id, email) values ('${NEW}', 'new@test')`);
  await asMember(db, NINA, async () => {
    await db.query(`select public.create_member('${NEW}','new@test','New Comer', now(), now())`);
    await db.query(`select public.activate_member('${NEW}')`);
  });

  configure(db, NINA);
  const result = await setAttendance(
    null,
    form({ session_id: SESSION, member_id: NEW, attended: "yes" }),
  );

  assert.equal(result?.error, undefined);
  const rows = await getSessionPrep(SESSION);
  assert.equal(rows.find((r) => r.memberId === NEW).attended, true);
});

test("a cancelled member keeps their place in a session they were in", async () => {
  configure(db, NINA);
  await asMember(db, NINA, () =>
    db.query(`select public.cancel_member('${WROTE}')`),
  );

  const rows = await getSessionPrep(SESSION);
  const wren = rows.find((r) => r.memberId === WROTE);

  assert.ok(wren, "their record of the session should survive cancellation");
  assert.equal(wren.stillActive, false);
});

test("the replay note saves and clears", async () => {
  configure(db, NINA);
  await saveReplayNote(null, form({ session_id: SESSION, replay_note: "Clipped, in Cinema Allegro" }));
  let row = (await db.query(`select replay_note from public.hot_seat_sessions where id='${SESSION}'`)).rows[0];
  assert.equal(row.replay_note, "Clipped, in Cinema Allegro");

  await saveReplayNote(null, form({ session_id: SESSION, replay_note: "  " }));
  row = (await db.query(`select replay_note from public.hot_seat_sessions where id='${SESSION}'`)).rows[0];
  assert.equal(row.replay_note, null);
});

test("a member cannot prep, mark attendance, or write the replay note", async () => {
  configure(db, SILENT);
  for (const [action, fields] of [
    [confirmChallenge, { session_id: SESSION, member_id: SILENT, confirmed_challenge: "Mine" }],
    [setAttendance, { session_id: SESSION, member_id: SILENT, attended: "yes" }],
    [saveReplayNote, { session_id: SESSION, replay_note: "nope" }],
  ]) {
    await assert.rejects(() => action(null, form(fields)), /REDIRECT:\/piazza/);
  }
});
