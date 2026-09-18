/**
 * The hot seat prep thread (round 3, §B), driven through the app's own Server
 * Actions: Nina's note, the member's reply, the push, the Piazza flag, and
 * the thread closing when the build is locked. Its own database, because the
 * prep-sheet tests count active members and this needs members of its own.
 *
 * The push half runs through the real sender with web-push stubbed, the same
 * as push-send.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
// Registers the module hooks; must come before the dynamic imports below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
process.env.VAPID_PRIVATE_KEY = "test-private";
process.env.VAPID_SUBJECT = "mailto:test@test";

const { pushed, reset: resetPush } = await import("./stubs/web-push.mjs");
const { flushAfter } = await import("./stubs/next-server.mjs");
const { commentOnSubmission, confirmChallenge } = await import("../../src/lib/admin/hot-seat-actions.ts");
const { replyOnSubmission, markCommentsSeen } = await import("../../src/lib/hot-seat/actions.ts");
const { getComments, hasUnseenCoachComment, getMySubmission } = await import("../../src/lib/hot-seat/queries.ts");
const { pushForHotSeatComment } = await import("../../src/lib/push/send.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values ('${NINA}', 'nina@allegro.test');
  insert into public.members (id, email, full_name, role, status, is_coach)
    values ('${NINA}', 'nina@allegro.test', 'Nina', 'admin', 'active', true);
`);

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const PIA = "88888888-8888-8888-8888-888888888888";
const QUIN = "99999999-9999-9999-9999-999999999999";
const SESSION2 = "77777777-7777-7777-7777-777777777777";
await db.exec(`
  insert into auth.users (id, email) values ('${PIA}','pia@test'), ('${QUIN}','quin@test');
`);
await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${PIA}','pia@test','Pia Moss', now(), now())`);
  await db.query(`select public.create_member('${QUIN}','quin@test','Quin Day', now(), now())`);
  await db.query(`select public.activate_member('${PIA}')`);
  await db.query(`select public.activate_member('${QUIN}')`);
  await db.query(`insert into public.hot_seat_sessions (id, session_month, scheduled_for)
                  values ('${SESSION2}', '2026-03-01', '2026-03-03 10:00Z')`);
});
await db.exec(`
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values
    ('${PIA}','https://push/pia-phone','k','a'),
    ('${PIA}','https://push/pia-laptop','k','a'),
    ('${QUIN}','https://push/quin-phone','k','a'),
    ('${NINA}','https://push/nina','k','a');
`);
await asMember(db, PIA, () =>
  db.query(`insert into public.hot_seat_submissions (session_id, member_id, challenge, reflection_unsure, submitted_at)
            values ('${SESSION2}', '${PIA}', 'Proposals take a week', true, now())`));
const piaSub = async () => (await db.query(
  `select id from public.hot_seat_submissions where session_id='${SESSION2}' and member_id='${PIA}'`)).rows[0].id;

test("Nina's note lands on the thread and pushes the member, every device, not Nina", async () => {
  resetPush();
  configure(db, NINA);
  const result = await commentOnSubmission(null, form({
    submission_id: await piaSub(),
    body: "Your log says Tuesdays. Look at what the 2pm block actually is.",
  }));
  assert.equal(result?.error, undefined);
  await flushAfter();

  const thread = (await getComments([await piaSub()])).get(await piaSub());
  assert.equal(thread.length, 1);
  assert.equal(thread[0].fromCoach, true);

  const to = pushed().map((p) => p.endpoint).sort();
  assert.deepEqual(to, ["https://push/pia-laptop", "https://push/pia-phone"]);
  assert.match(pushed()[0].payload.title, /Nina's left a note/);
  assert.equal(pushed()[0].payload.url, "/hot-seat");
});

test("the note is the Piazza flag until the member opens the thread", async () => {
  configure(db, PIA);
  const sub = await getMySubmission(PIA, SESSION2);
  const thread = (await getComments([sub.id])).get(sub.id);
  assert.equal(hasUnseenCoachComment(sub, thread), true);

  await markCommentsSeen(sub.id);
  const seen = await getMySubmission(PIA, SESSION2);
  assert.equal(hasUnseenCoachComment(seen, thread), false);
});

test("the member replies, and the reply pushes nobody", async () => {
  resetPush();
  configure(db, PIA);
  const result = await replyOnSubmission(null, form({ submission_id: await piaSub(), body: "It is the reconciliation." }));
  assert.equal(result, null);
  await flushAfter();

  const thread = (await getComments([await piaSub()])).get(await piaSub());
  assert.equal(thread.length, 2);
  assert.equal(thread[1].fromCoach, false);
  assert.equal(pushed().length, 0);
});

test("the sender itself refuses a member's own comment, whoever calls it", async () => {
  // Nothing in the app sends a member's reply to push. If something ever did,
  // this is the guard: a comment by the submission's owner pushes nobody.
  resetPush();
  const reply = (await db.query(
    `select id from public.hot_seat_comments where member_id = '${PIA}' limit 1`)).rows[0].id;
  assert.equal(await pushForHotSeatComment(reply), 0);
  assert.equal(pushed().length, 0);
});

test("a member's own reply is not a new flag", async () => {
  configure(db, PIA);
  const sub = await getMySubmission(PIA, SESSION2);
  const thread = (await getComments([sub.id])).get(sub.id);
  assert.equal(hasUnseenCoachComment(sub, thread), false);
});

test("a note to somebody who never submitted starts their thread, and their row", async () => {
  resetPush();
  configure(db, NINA);
  const result = await commentOnSubmission(null, form({
    session_id: SESSION2, member_id: QUIN, body: "Nothing from you yet. Your log says finance admin. Shall we start there?",
  }));
  assert.equal(result?.error, undefined);
  await flushAfter();
  assert.equal(await (async () => (await db.query(
    `select count(*)::int c from public.hot_seat_submissions where session_id='${SESSION2}' and member_id='${QUIN}'`)).rows[0].c)(), 1);
  assert.deepEqual(pushed().map((p) => p.endpoint), ["https://push/quin-phone"]);
});

test("a blank note is refused in words", async () => {
  configure(db, NINA);
  const result = await commentOnSubmission(null, form({ submission_id: await piaSub(), body: "   " }));
  assert.match(result?.error ?? "", /Write the note/);
});

test("once the build is locked, the member's side of the thread closes; Nina's doesn't", async () => {
  configure(db, NINA);
  await confirmChallenge(null, form({ submission_id: await piaSub(), confirmed_challenge: "A proposal template that takes an hour" }));

  configure(db, PIA);
  const result = await replyOnSubmission(null, form({ submission_id: await piaSub(), body: "One more thing" }));
  assert.match(result?.error ?? "", /thread is closed/);

  configure(db, NINA);
  const ok = await commentOnSubmission(null, form({ submission_id: await piaSub(), body: "Locked. See you Tuesday." }));
  assert.equal(ok?.error, undefined);
  assert.equal((await getComments([await piaSub()])).get(await piaSub()).length, 3);
});

test("a member cannot leave a note as Nina: the admin gate sends them home", async () => {
  configure(db, PIA);
  const sub = await piaSub();
  await assert.rejects(
    () => commentOnSubmission(null, form({ submission_id: sub, body: "Pretending" })),
    /REDIRECT/,
  );
  assert.equal((await getComments([await piaSub()])).get(await piaSub()).length, 3);
});

// Round 4, item 12: the four questions land in their columns.
const { saveSubmission } = await import("../../src/lib/hot-seat/actions.ts");

test("the four questions save to their own columns; the retired two are never written", async () => {
  configure(db, QUIN);
  const result = await saveSubmission(null, form({
    session_id: SESSION2,
    challenge: "Everything lands on me",
    time_sink: "Client emails, all day",
    should_stop: "Chasing invoices",
    reflection: "The invoicing, probably",
    reflection_unsure: "on",
  }));
  assert.equal(result?.error, undefined);
  const row = (await db.query(
    `select challenge, time_sink, should_stop, reflection, reflection_unsure, already_tried, done_looks_like, submitted_at
     from public.hot_seat_submissions where session_id='${SESSION2}' and member_id='${QUIN}'`)).rows[0];
  assert.equal(row.challenge, "Everything lands on me");
  assert.equal(row.time_sink, "Client emails, all day");
  assert.equal(row.should_stop, "Chasing invoices");
  assert.equal(row.reflection, "The invoicing, probably");
  assert.equal(row.reflection_unsure, true);
  assert.equal(row.already_tried, null);
  assert.equal(row.done_looks_like, null);
  assert.ok(row.submitted_at);
});

test("the first question is the one that's required", async () => {
  configure(db, QUIN);
  const result = await saveSubmission(null, form({ session_id: SESSION2, challenge: "  ", time_sink: "x" }));
  assert.match(result?.error ?? "", /feel stuck/);
});
