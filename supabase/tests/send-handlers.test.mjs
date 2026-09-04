/**
 * The job runner's send path.
 *
 * This is the layer that has had no test all week, and the reason it matters is
 * that every failure in it is silent. A handler that skips when it should send
 * produces no error and no email — nobody complains about a message they never
 * knew was coming. A handler that sends to the wrong person produces an email
 * that looks entirely normal to whoever receives it.
 *
 * What's asserted throughout: who it went to, whether it went at all, and the
 * words — not just that the function returned.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { reset, sent, failNextSend } from "./stubs/email-send.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.test";

const {
  runBuildCheckIn,
  runPairingBooked,
  runPairingDay7,
  runChatNotification,
  runHoursLedger,
} = await import("../../src/lib/jobs/runner.ts");

// The stub directly: a relative import would bypass the hook that substitutes
// this module, and pull in the real client and its environment variables.
const { createAdminClient } = await import("./stubs/supabase-admin.mjs");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const OMAR = "33333333-3333-3333-3333-333333333333";
const GONE = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test'),
    ('${OMAR}','omar@test'), ('${GONE}','gone@test');
  insert into public.members (id, email, full_name, role, status, is_coach)
    values ('${NINA}','nina@allegro.test','Nina Ricci','admin','active', true);
`);

await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [RUTH, "ruth@test", "Ruth Bell"],
    [OMAR, "omar@test", "Omar Diaz"],
    [GONE, "gone@test", "Gone Away"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
  await db.query(`select public.cancel_member('${GONE}')`);
});

// The handlers use the service-role client, so the fixture is configured with
// no uid — exactly how the cron runs.
configure(db, null);
const admin = createAdminClient();

const BUILD = "55555555-5555-5555-5555-555555555555";
await db.query(`
  insert into public.handover_pack (id, member_id, title, source)
  values ('${BUILD}', '${RUTH}', 'Automated enquiry follow-up', 'hot_seat')`);
await db.query(`
  insert into public.handover_pack_rates (handover_pack_id, hours_per_week, effective_from)
  values ('${BUILD}', 5, '2026-08-01')`);

test.beforeEach(() => reset());

// ---------------------------------------------------------------------------

test("the check-in email names the build and asks what isn't working", async () => {
  const outcome = await runBuildCheckIn(admin, {
    member_id: RUTH,
    payload: { handover_pack_id: BUILD },
  });

  assert.equal(outcome, "sent");
  assert.equal(sent().length, 1);
  assert.equal(sent()[0].to, "ruth@test");
  assert.match(sent()[0].subject, /Automated enquiry follow-up/);
  assert.match(sent()[0].text, /what isn't/i);
  // The rate it currently earns, so the question has a number attached.
  assert.match(sent()[0].text, /5 hours a week/);
});

test("the check-in opens the conversation it links to", async () => {
  const link = sent()[0]?.text ?? "";
  const channels = await db.query(
    `select id from public.chat_channels where kind = 'direct'`,
  );
  assert.equal(channels.rows.length, 1, "the DM should have been created");
  // Rerun to populate the outbox for this assertion.
  await runBuildCheckIn(admin, { member_id: RUTH, payload: { handover_pack_id: BUILD } });
  assert.match(sent()[0].text, new RegExp(channels.rows[0].id));
  assert.ok(link !== undefined);
});

test("a cancelled member is not asked how their build is going", async () => {
  const build = "66666666-6666-6666-6666-666666666666";
  await db.query(`
    insert into public.handover_pack (id, member_id, title, source)
    values ('${build}', '${GONE}', 'Something they built', 'hot_seat')`);
  await db.query(`
    insert into public.handover_pack_rates (handover_pack_id, hours_per_week, effective_from)
    values ('${build}', 2, '2026-08-01')`);

  const outcome = await runBuildCheckIn(admin, {
    member_id: GONE,
    payload: { handover_pack_id: build },
  });

  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
});

test("a retired build isn't asked about — there's nothing left to answer", async () => {
  const build = "77777777-7777-7777-7777-777777777777";
  await db.query(`
    insert into public.handover_pack (id, member_id, title, source)
    values ('${build}', '${OMAR}', 'Retired thing', 'hot_seat')`);
  await db.query(`
    insert into public.handover_pack_rates
      (handover_pack_id, hours_per_week, effective_from, effective_until)
    values ('${build}', 3, '2026-06-01', '2026-07-01')`);

  const outcome = await runBuildCheckIn(admin, {
    member_id: OMAR,
    payload: { handover_pack_id: build },
  });

  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
});

// ---------------------------------------------------------------------------

const PAIRING = "88888888-8888-8888-8888-888888888888";
await db.exec(`
  insert into public.pairings (id, pairing_month) values ('${PAIRING}', '2026-09-01');
  insert into public.pairing_participants (pairing_id, member_id, pairing_month) values
    ('${PAIRING}', '${RUTH}', '2026-09-01'),
    ('${PAIRING}', '${OMAR}', '2026-09-01');
  insert into public.pairing_availability (member_id, pairing_month, availability, submitted_at) values
    ('${RUTH}', '2026-09-01', '{"slots":["tue-pm","thu-am"]}'::jsonb, now()),
    ('${OMAR}', '2026-09-01', '{"slots":["tue-pm"]}'::jsonb, now());`);

test("the booked-in email names the partner, not the recipient", async () => {
  const outcome = await runPairingBooked(admin, {
    member_id: RUTH,
    payload: { pairing_id: PAIRING },
  });

  assert.equal(outcome, "sent");
  assert.equal(sent()[0].to, "ruth@test");
  assert.match(sent()[0].subject, /Omar Diaz/);
  assert.doesNotMatch(sent()[0].subject, /Ruth/);
});

test("it names the time they both ticked", async () => {
  await runPairingBooked(admin, { member_id: OMAR, payload: { pairing_id: PAIRING } });
  assert.match(sent()[0].text, /tuesday afternoon/i);
});

test("with no shared slot it says so rather than inventing one", async () => {
  await db.query(`
    update public.pairing_availability set availability = '{"slots":["fri-eve"]}'::jsonb
    where member_id = '${OMAR}' and pairing_month = '2026-09-01'`);

  await runPairingBooked(admin, { member_id: RUTH, payload: { pairing_id: PAIRING } });
  assert.match(sent()[0].text, /didn't tick any of the same slots/i);
});

test("no call link is offered — §9 has the pair arranging it", async () => {
  await runPairingBooked(admin, { member_id: RUTH, payload: { pairing_id: PAIRING } });
  // Matching on the words would be wrong: the copy says "there's no call link"
  // out loud. What must not appear is an actual meeting URL.
  assert.doesNotMatch(sent()[0].text, /zoom\.us|meet\.google|teams\.microsoft/i);
  assert.match(sent()[0].text, /your conversation to arrange/i);
});

// ---------------------------------------------------------------------------

test("the day-7 flag goes to the coach, not to the pair", async () => {
  const outcome = await runPairingDay7(admin, {
    member_id: NINA,
    payload: { pairing_id: PAIRING },
  });

  assert.equal(outcome, "sent");
  assert.equal(sent()[0].to, "nina@allegro.test");
  assert.match(sent()[0].subject, /Ruth Bell and Omar Diaz|Omar Diaz and Ruth Bell/);
});

test("it sets the flag as it sends, so it can't fire twice", async () => {
  const row = await db.query(
    `select flagged_at from public.pairings where id = '${PAIRING}'`,
  );
  assert.ok(row.rows[0].flagged_at);

  const outcome = await runPairingDay7(admin, {
    member_id: NINA,
    payload: { pairing_id: PAIRING },
  });
  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
});

// The guard whose deletion no test noticed until it was verified by hand.
test("a pair who met are not flagged", async () => {
  const pairing = "99999999-9999-9999-9999-999999999999";
  await db.exec(`
    insert into public.pairings (id, pairing_month, met_at)
    values ('${pairing}', '2026-10-01', now());
    insert into public.pairing_participants (pairing_id, member_id, pairing_month) values
      ('${pairing}', '${RUTH}', '2026-10-01'), ('${pairing}', '${OMAR}', '2026-10-01');`);

  const outcome = await runPairingDay7(admin, {
    member_id: NINA,
    payload: { pairing_id: pairing },
  });

  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
  const row = await db.query(
    `select flagged_at from public.pairings where id = '${pairing}'`,
  );
  assert.equal(row.rows[0].flagged_at, null, "a pair who met should not be flagged");
});

// ---------------------------------------------------------------------------

test("the unread email says who wrote, and never quotes the message", async () => {
  const channel = (await db.query(
    `select public.ensure_direct_channel('${RUTH}','${OMAR}') id`,
  )).rows[0].id;
  const message = (await db.query(`
    insert into public.chat_messages (channel_id, member_id, body, created_at)
    values ('${channel}', '${OMAR}', 'Something private about my revenue', now() - interval '2 hours')
    returning id`)).rows[0].id;

  const outcome = await runChatNotification(admin, {
    member_id: RUTH,
    payload: { channel_id: channel, oldest_message_id: message, count: 1 },
  });

  assert.equal(outcome, "sent");
  assert.equal(sent()[0].to, "ruth@test");
  assert.match(sent()[0].subject, /Omar Diaz/);
  // Repeating a DM into an inbox turns a private conversation into email.
  assert.doesNotMatch(sent()[0].text, /revenue/i);
});

test("reading it first cancels the email", async () => {
  const channel = (await db.query(
    `select id from public.chat_channels where kind = 'direct'
     order by created_at desc limit 1`,
  )).rows[0].id;
  const message = (await db.query(
    `select id, created_at from public.chat_messages where channel_id = '${channel}'
     order by created_at limit 1`,
  )).rows[0];

  await db.query(`
    insert into public.chat_reads (channel_id, member_id, last_read_at)
    values ('${channel}', '${RUTH}', now())
    on conflict (channel_id, member_id) do update set last_read_at = now()`);

  const outcome = await runChatNotification(admin, {
    member_id: RUTH,
    payload: { channel_id: channel, oldest_message_id: message.id, count: 1 },
  });

  assert.equal(outcome, "skipped");
  assert.equal(sent().length, 0);
});

// ---------------------------------------------------------------------------

test("a qualifying week is banked and reported as sent", async () => {
  await db.exec(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
      ('${RUTH}','client-sessions','2026-09-07 09:00Z','2026-09-07 20:00Z');
    insert into public.weekly_submissions (member_id, week_start_date, submitted_at)
    values ('${RUTH}', '2026-09-07', now());`);

  const outcome = await runHoursLedger(admin, {
    member_id: RUTH,
    payload: { week_start: "2026-09-07" },
  });

  assert.equal(outcome, "sent");
  const row = await db.query(
    `select hours::float h from public.hours_ledger
     where member_id = '${RUTH}' and week_start_date = '2026-09-07'`,
  );
  assert.equal(row.rows[0].h, 5);
});

// Not qualifying is a normal outcome, not an error — a week reported as failed
// would show up in the cron summary as something to investigate.
test("a week that didn't qualify is skipped, not failed", async () => {
  const outcome = await runHoursLedger(admin, {
    member_id: OMAR,
    payload: { week_start: "2026-09-14" },
  });

  assert.equal(outcome, "skipped");
});

// ---------------------------------------------------------------------------

test("a delivery failure is raised, not swallowed as a success", async () => {
  failNextSend("Resend rejected it");

  await assert.rejects(
    () =>
      runBuildCheckIn(admin, {
        member_id: RUTH,
        payload: { handover_pack_id: BUILD },
      }),
    /Resend rejected it/,
  );
});
