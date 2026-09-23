/**
 * The monthly recap, driven through the app's own actions.
 *
 * Three things have no other test and all fail quietly:
 *
 *   · the two-step send — saving must not reach the member, and sending must
 *     not be undoable by a second press or a second tab
 *   · the email — who it goes to, and that it names their month rather than
 *     quoting the recap into an inbox
 *   · the collator — what lands in the block Nina pastes into Claude. A wrong
 *     number there is a wrong sentence in a document about somebody's month,
 *     and nothing downstream can catch it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { sent, reset as resetEmail } from "./stubs/email-send.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.test";

const { saveRecap, sendRecap } = await import("../../src/lib/admin/recap-actions.ts");
const { getRecapSource } = await import("../../src/lib/admin/recap-source.ts");
const { getMyRecap, getMyRecaps, getUnreadRecap } = await import("../../src/lib/recap/queries.ts");
const { markRecapOpened } = await import("../../src/lib/recap/mark.ts");
const { compileRecapSource } = await import("../../src/lib/recap/compile.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "33333333-3333-3333-3333-333333333333";
const OMAR = "44444444-4444-4444-4444-444444444444";
const MONTH = "2026-08-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test'), ('${OMAR}','omar@test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [RUTH, "ruth@test", "Ruth Bell"],
    [OMAR, "omar@test", "Omar Diaz"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
});

const form = (fields) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

const row = async () =>
  (await db.query(
    `select body, sent_at, opened_at from public.monthly_recaps
     where member_id = '${RUTH}' and recap_month = '${MONTH}'`,
  )).rows[0];

test.beforeEach(() => resetEmail());

test("a member cannot write or send a recap", async () => {
  configure(db, RUTH);
  await assert.rejects(
    () => saveRecap(null, form({ member_id: RUTH, recap_month: MONTH, body: "Mine now" })),
    /REDIRECT:\/piazza/,
  );
  await assert.rejects(
    () => sendRecap(null, form({ member_id: RUTH, recap_month: MONTH })),
    /REDIRECT:\/piazza/,
  );
});

test("saving stores the text and reaches nobody", async () => {
  configure(db, NINA);
  const result = await saveRecap(
    null,
    form({ member_id: RUTH, recap_month: MONTH, body: "August was the month the follow-up stopped eating your Tuesdays." }),
  );
  await flushAfter();

  assert.equal(result?.error, undefined);
  assert.match(result?.notice ?? "", /not sent/i);
  assert.match((await row()).body, /follow-up stopped eating/);
  assert.equal((await row()).sent_at, null);
  assert.equal(sent().length, 0);

  // And the member still can't see it.
  configure(db, RUTH);
  assert.equal(await getMyRecap(RUTH, MONTH), null);
  assert.equal(await getUnreadRecap(RUTH), null);
});

test("saving again replaces the draft rather than making a second one", async () => {
  configure(db, NINA);
  await saveRecap(null, form({ member_id: RUTH, recap_month: MONTH, body: "Second thoughts." }));
  const count = await db.query(
    `select count(*)::int c from public.monthly_recaps where member_id = '${RUTH}'`,
  );
  assert.equal(count.rows[0].c, 1);
  assert.equal((await row()).body, "Second thoughts.");
});

test("an empty recap can't be sent", async () => {
  configure(db, NINA);
  await saveRecap(null, form({ member_id: RUTH, recap_month: MONTH, body: "   " }));
  const result = await sendRecap(null, form({ member_id: RUTH, recap_month: MONTH }));
  assert.match(result?.error ?? "", /no recap written/i);
  assert.equal((await row()).sent_at, null);
  assert.equal(sent().length, 0);
});

test("sending emails the member and names their month, without quoting the recap", async () => {
  configure(db, NINA);
  await saveRecap(
    null,
    form({ member_id: RUTH, recap_month: MONTH, body: "August was the month the follow-up stopped eating your Tuesdays." }),
  );
  resetEmail();

  const result = await sendRecap(null, form({ member_id: RUTH, recap_month: MONTH }));
  await flushAfter();

  assert.equal(result?.error, undefined);
  assert.ok((await row()).sent_at, "sent_at is set");

  assert.equal(sent().length, 1);
  assert.equal(sent()[0].to, "ruth@test");
  assert.match(sent()[0].subject, /August/);
  assert.match(sent()[0].text, /Ruth,/);
  assert.match(sent()[0].text, /https:\/\/aos\.test\/reviews\/2026-08/);
  // The recap is a page to visit, not an email to skim: putting the writing
  // in the email would make the page pointless and the archive unread.
  assert.doesNotMatch(sent()[0].text, /eating your Tuesdays/);
});

test("a second send is refused, and sends nothing", async () => {
  configure(db, NINA);
  const result = await sendRecap(null, form({ member_id: RUTH, recap_month: MONTH }));
  assert.match(result?.error ?? "", /already sent/i);
  assert.equal(sent().length, 0);
});

test("a sent recap can't be quietly rewritten", async () => {
  configure(db, NINA);
  const result = await saveRecap(
    null,
    form({ member_id: RUTH, recap_month: MONTH, body: "Actually, scrap that." }),
  );
  assert.match(result?.error ?? "", /can't be rewritten/i);
  assert.match((await row()).body, /eating your Tuesdays/);
});

test("once sent it's on their Piazza, and in their archive", async () => {
  configure(db, RUTH);
  const unread = await getUnreadRecap(RUTH);
  assert.equal(unread?.month, MONTH);
  assert.deepEqual((await getMyRecaps(RUTH)).map((r) => r.month), [MONTH]);

  // And it is theirs alone.
  configure(db, OMAR);
  assert.equal(await getUnreadRecap(OMAR), null);
  assert.deepEqual(await getMyRecaps(OMAR), []);
});

test("reading it takes the card off Piazza, and the timestamp doesn't move after", async () => {
  configure(db, RUTH);
  await markRecapOpened(RUTH, MONTH);
  const first = (await row()).opened_at;
  assert.ok(first);
  assert.equal(await getUnreadRecap(RUTH), null);

  await markRecapOpened(RUTH, MONTH);
  assert.deepEqual((await row()).opened_at, first, "a second visit doesn't move it");

  // Still in the archive afterwards — read is not gone.
  assert.deepEqual((await getMyRecaps(RUTH)).map((r) => r.month), [MONTH]);
});

test("a member can't mark somebody else's recap read", async () => {
  configure(db, OMAR);
  await markRecapOpened(RUTH, MONTH);
  const r = await db.query(
    `select count(*)::int c from public.monthly_recaps
     where member_id = '${RUTH}' and opened_at is not null`,
  );
  assert.equal(r.rows[0].c, 1, "Ruth's own read stands, and Omar changed nothing");
});

// ---------------------------------------------------------------------------
// The collator
// ---------------------------------------------------------------------------

test("the source block carries the month's real numbers, and only that month's", async () => {
  // August: 90 minutes tracked, a signed-off week with a reflection, a ledger
  // week. July and September get rows too, and must not appear.
  await asMember(db, RUTH, () => db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at)
    values
      ('${RUTH}', 'finance-admin', '2026-08-04T09:00Z', '2026-08-04T10:00Z'),
      ('${RUTH}', 'finance-admin', '2026-08-05T09:00Z', '2026-08-05T09:30Z'),
      ('${RUTH}', 'finance-admin', '2026-09-01T09:00Z', '2026-09-01T17:00Z')`));

  await asMember(db, RUTH, () => db.query(`
    insert into public.weekly_submissions
      (member_id, week_start_date, other_activity, submitted_at)
    values
      ('${RUTH}', '2026-08-03', 'Nearly cancelled a client. Didn''t.', '2026-08-07T17:00Z'),
      ('${RUTH}', '2026-09-07', 'A September thought.', '2026-09-11T17:00Z')`));

  await db.query(`
    insert into public.hours_ledger (member_id, week_start_date, hours, breakdown)
    values
      ('${RUTH}', '2026-08-03', 3, '[]'::jsonb),
      ('${RUTH}', '2026-09-07', 5, '[]'::jsonb)`);

  configure(db, NINA);
  const source = await getRecapSource(RUTH, MONTH);
  assert.ok(source);
  assert.equal(source.memberName, "Ruth Bell");
  assert.equal(source.loggedMinutes, 90, "September's eight hours are not August's");
  assert.equal(source.weeksSignedOff, 1);
  assert.equal(source.hoursReclaimedThisMonth, 3);
  assert.equal(source.hoursReclaimedTotal, 8, "the running total is every week, not this month's");
  assert.deepEqual(
    source.reflections.map((r) => r.weekStart),
    ["2026-08-03"],
  );

  const block = compileRecapSource(source);
  assert.match(block, /1h 30m logged/);
  assert.match(block, /Nearly cancelled a client/);
  assert.doesNotMatch(block, /A September thought/);
});

test("the private reflections come through labelled as private", async () => {
  configure(db, NINA);
  const source = await getRecapSource(RUTH, MONTH);
  const block = compileRecapSource(source);
  assert.match(block, /PRIVATE FRIDAY REFLECTIONS/);
  assert.match(block, /never posted into a shared room/);
});

test("a member who tracked nothing still collates, with zeroes", async () => {
  configure(db, NINA);
  const source = await getRecapSource(OMAR, MONTH);
  assert.ok(source);
  assert.equal(source.loggedMinutes, 0);
  assert.equal(source.hoursReclaimedTotal, 0);
  assert.deepEqual(source.reflections, []);
  assert.match(compileRecapSource(source), /None ticked off this month\./);
});
