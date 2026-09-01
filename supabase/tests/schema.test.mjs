/**
 * Schema tests — `npm run test:db`.
 *
 * Runs every migration against a real Postgres (PGlite, compiled to WASM — no
 * Docker, no local server) and then exercises the RLS policies as actual members,
 * because a policy that compiles can still be wrong in either direction.
 *
 * The `auth` schema below is a minimal stand-in for what Supabase manages. It is
 * NOT a substitute for running the migrations against the real project — table
 * grants, auth triggers and extensions differ — but it catches the mistakes that
 * are expensive to find later: a member reading someone else's row, a cancelled
 * member keeping access, a gate that locks people out of their own work.
 *
 * Version note: PGlite is Postgres 18, the Supabase project is 17
 * (supabase/config.toml). Nothing here uses an 18-only feature — the newest
 * things in the migrations are generated columns (12+) and security_invoker
 * views (15+) — but it's a difference to remember if a push ever fails on
 * something that passed here.
 */
import { createTestDatabase, asMember } from "./pglite.mjs";

const db = await createTestDatabase();

const ADMIN = "11111111-1111-1111-1111-111111111111";
const ALICE = "22222222-2222-2222-2222-222222222222";
const BOB = "33333333-3333-3333-3333-333333333333";

await db.exec(`
  insert into auth.users (id, email) values
    ('${ADMIN}', 'nina@allegro.test'),
    ('${ALICE}', 'alice@test'),
    ('${BOB}', 'bob@test');
  -- Bootstrap the first admin directly: create_member() requires an existing
  -- admin, so the very first one cannot come through it.
  insert into public.members (id, email, full_name, role, status)
    values ('${ADMIN}', 'nina@allegro.test', 'Nina', 'admin', 'active');
`);

let pass = 0, fail = 0;
const as = (uid, fn) => asMember(db, uid, fn);
async function check(name, fn) {
  try { const r = await fn(); if (r === true) { pass++; console.log(`  ok   ${name}`); }
        else { fail++; console.log(`  FAIL ${name} — got ${JSON.stringify(r)}`); } }
  catch (e) { fail++; console.log(`  FAIL ${name} — threw: ${e.message}`); }
}
async function rejects(name, fn, expect) {
  try { await fn(); fail++; console.log(`  FAIL ${name} — expected rejection, none thrown`); }
  catch (e) {
    if (!expect || e.message.includes(expect)) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} — wrong error: ${e.message}`); }
  }
}

console.log("\n— member creation —");

await rejects("non-admin cannot create a member", () =>
  as(ALICE, () => db.query(`select public.create_member('${ALICE}','alice@test','Alice')`)),
  "Only an admin");

await check("admin creates a member, status onboarding", async () =>
  (await as(ADMIN, () => db.query(
    `select (public.create_member('${ALICE}','alice@test','Alice', now(), now(), 6::smallint, '2026-01-15'::date)).status`
  ))).rows[0].status === "onboarding");

await check("contract_term_end_date = join + 6 months", async () =>
  (await as(ADMIN, () => db.query(
    `select contract_term_end_date::text d from public.members where id = '${ALICE}'`
  ))).rows[0].d === "2026-07-15");

await rejects("create_member refuses without contract signed", () =>
  as(ADMIN, () => db.query(
    `select public.create_member('${BOB}','bob@test','Bob', now(), null)`)),
  "Payment and signed contract");

// Mirrors exactly how the admin invite action calls this over PostgREST: named
// parameters, p_join_date and p_contract_term_end_date omitted so their defaults
// apply. A renamed or reordered parameter breaks the app but not the SQL, so it
// would otherwise only surface the first time someone sends a real invitation.
await check("create_member accepts the named parameters the app sends", async () => {
  const id = "44444444-4444-4444-4444-444444444444";
  await db.exec(`insert into auth.users (id, email) values ('${id}', 'carla@test')`);
  const r = await as(ADMIN, () => db.query(`
    select (public.create_member(
      p_user_id => '${id}',
      p_email => 'carla@test',
      p_full_name => 'Carla',
      p_payment_confirmed_at => now(),
      p_contract_signed_at => now(),
      p_contract_term_months => 6::smallint
    )).contract_term_end_date::text as d`));
  // Default join date is today, so the term should end six months out.
  const expected = new Date();
  expected.setMonth(expected.getMonth() + 6);
  return r.rows[0].d === expected.toISOString().slice(0, 10);
});

console.log("\n— access isolation —");

await check("member reads own row", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.members`))).rows[0].c === 1);

await check("member cannot see other members' rows", async () =>
  (await as(ALICE, () => db.query(
    `select count(*)::int c from public.members where id = '${ADMIN}'`))).rows[0].c === 0);

await check("admin sees all members", async () => {
  // Compared against the true row count rather than a literal, so adding a
  // member to a test above doesn't silently break this one.
  const all = (await db.query(`select count(*)::int c from public.members`)).rows[0].c;
  const seen = (await as(ADMIN, () => db.query(`select count(*)::int c from public.members`))).rows[0].c;
  return seen === all && all > 1;
});

await rejects("member cannot promote themselves to admin", () =>
  as(ALICE, () => db.query(`update public.members set role='admin' where id='${ALICE}'`)),
  "Only an admin");

await rejects("member cannot set themselves active", () =>
  as(ALICE, () => db.query(`update public.members set status='active' where id='${ALICE}'`)),
  "Only an admin");

console.log("\n— library tiering —");

await db.exec(`
  insert into public.training_content (title, slug, station_slug, available_during_onboarding, published_at)
  values ('Looking at the data','looking-at-data','banco-allegro', true, now()),
         ('Advanced launches','advanced-launches','stazione-centrale', false, now()),
         ('Unpublished draft','draft','terrazza', true, null);
`);

await check("onboarding member sees only the starter set", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.training_content`))).rows[0].c === 1);

await rejects("a member cannot activate themselves", () =>
  as(ALICE, () => db.query(`select public.activate_member('${ALICE}')`)),
  "Only an admin");

await check("admin activates an onboarding member", async () =>
  (await as(ADMIN, () => db.query(
    `select (public.activate_member('${ALICE}')).status`))).rows[0].status === "active");

await rejects("activating an already-active member is refused", () =>
  as(ADMIN, () => db.query(`select public.activate_member('${ALICE}')`)),
  "only an onboarding member can be activated");

await check("activation is recorded in the status history", async () =>
  (await as(ADMIN, () => db.query(
    `select count(*)::int c from public.member_status_events
     where to_status='active' and from_status='onboarding'`))).rows[0].c === 1);

await check("active member sees the full published library", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.training_content`))).rows[0].c === 2);

console.log("\n— weekly log —");

await as(ALICE, () => db.query(`
  insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
    ('${ALICE}','client-sessions','2026-03-02 09:00Z','2026-03-02 15:00Z'),
    ('${ALICE}','sales-calls',    '2026-03-03 09:00Z','2026-03-03 14:00Z')`));

await check("duration derived from start/stop", async () =>
  (await as(ALICE, () => db.query(
    `select sum(duration_minutes)::int m from public.time_entries`))).rows[0].m === 660);

await check("11 logged hours = a complete week", async () =>
  (await as(ALICE, () => db.query(
    `select is_complete_week w from public.weekly_time_totals`))).rows[0].w === true);

await as(ALICE, () => db.query(
  `insert into public.time_entries (member_id, category_slug, started_at) values ('${ALICE}','social-media', now())`));

await rejects("only one timer can run at a time", () =>
  as(ALICE, () => db.query(
    `insert into public.time_entries (member_id, category_slug, started_at) values ('${ALICE}','ads-marketing', now())`)),
  "duplicate key");

await check("complete_weeks_in_month counts the 10-hour weeks", async () =>
  (await as(ADMIN, () => db.query(
    `select public.complete_weeks_in_month('${ALICE}','2026-03-01'::date) c`))).rows[0].c === 1);

console.log("\n— roadmap —");

await as(ADMIN, () => db.query(
  `insert into public.roadmap (member_id, reason, current_focus) values ('${ALICE}','onboarding','Automate enquiry follow-up')`));

await check("creating a roadmap logs history automatically", async () =>
  (await as(ADMIN, () => db.query(`select count(*)::int c from public.roadmap_history`))).rows[0].c === 1);

await check("unconfirmed roadmap is hidden from the member", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.roadmap`))).rows[0].c === 0);

await as(ADMIN, () => db.query(`update public.roadmap set confirmed_at = now() where member_id='${ALICE}'`));

await check("confirmed roadmap is visible to the member", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.roadmap`))).rows[0].c === 1);

await rejects("a member cannot have two current roadmaps", () =>
  as(ADMIN, () => db.query(
    `insert into public.roadmap (member_id, reason) values ('${ALICE}','monthly_repoint')`)),
  "duplicate key");

console.log("\n— hot seat —");

const DANA = "55555555-5555-5555-5555-555555555555";
await db.exec(`insert into auth.users (id, email) values ('${DANA}', 'dana@test')`);
await as(ADMIN, () => db.query(`select public.create_member('${DANA}','dana@test','Dana')`));

const SESSION = (await as(ADMIN, () => db.query(
  `insert into public.hot_seat_sessions (session_month, scheduled_for, zoom_url)
   values ('2026-04-01', '2026-04-07 14:00Z', 'https://zoom.example/aos')
   returning id`))).rows[0].id;

await check("everyone with access sees the session, onboarding included", async () =>
  (await as(DANA, () => db.query(
    `select count(*)::int c from public.hot_seat_sessions`))).rows[0].c === 1);

await rejects("an onboarding member cannot submit — hot seat is locked until active", () =>
  as(DANA, () => db.query(
    `insert into public.hot_seat_submissions (session_id, member_id, challenge)
     values ('${SESSION}','${DANA}','Something')`)),
  "row-level security");

await check("an active member can submit", async () => {
  await as(ALICE, () => db.query(
    `insert into public.hot_seat_submissions (session_id, member_id, challenge, submitted_at)
     values ('${SESSION}','${ALICE}','Automate enquiry follow-up', now())`));
  const r = await as(ALICE, () => db.query(
    `select count(*)::int c from public.hot_seat_submissions`));
  return r.rows[0].c === 1;
});

await check("a member can revise their own submission before Nina confirms", async () => {
  await as(ALICE, () => db.query(
    `update public.hot_seat_submissions set already_tried = 'Zapier, badly' where member_id = '${ALICE}'`));
  const r = await as(ALICE, () => db.query(
    `select already_tried from public.hot_seat_submissions where member_id='${ALICE}'`));
  return r.rows[0].already_tried === "Zapier, badly";
});

await check("a member cannot see another member's submission", async () =>
  (await as(DANA, () => db.query(
    `select count(*)::int c from public.hot_seat_submissions`))).rows[0].c === 0);

await as(ADMIN, () => db.query(
  `update public.hot_seat_submissions
   set confirmed_challenge = 'Build the follow-up sequence', confirmed_at = now(), drafted_by = 'nina'
   where member_id = '${ALICE}'`));

await check("once confirmed, the member's own edit changes nothing", async () => {
  // No error — the UPDATE policy simply matches no rows, which is how RLS
  // refuses a write. The locked challenge is what goes into the room, so a
  // member rewriting it afterwards would desync the session from Nina's prep.
  await as(ALICE, () => db.query(
    `update public.hot_seat_submissions set challenge = 'Something else' where member_id='${ALICE}'`));
  const r = await as(ADMIN, () => db.query(
    `select challenge from public.hot_seat_submissions where member_id='${ALICE}'`));
  return r.rows[0].challenge === "Automate enquiry follow-up";
});

await check("admin sees every submission for the session", async () =>
  (await as(ADMIN, () => db.query(
    `select count(*)::int c from public.hot_seat_submissions where session_id='${SESSION}'`))).rows[0].c === 1);

console.log("\n— cancellation and rejoining —");

await as(ADMIN, () => db.query(
  `insert into public.handover_pack (member_id, title, source, confirmed_at)
   values ('${ALICE}','Enquiry follow-up automation','hot_seat', now())`));

await check("active member sees their handover pack", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.handover_pack`))).rows[0].c === 1);

await as(ADMIN, () => db.query(`select public.cancel_member('${ALICE}', 'Moving in-house')`));

await check("cancellation is logged with its note", async () =>
  (await as(ADMIN, () => db.query(
    `select note from public.member_status_events where to_status='cancelled'`))).rows[0].note === "Moving in-house");

await check("cancelled member loses access to content", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.handover_pack`))).rows[0].c === 0);

await check("cancelled member loses the library", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.training_content`))).rows[0].c === 0);

await check("cancelled member CAN still read their own row (to be told why)", async () =>
  (await as(ALICE, () => db.query(`select status from public.members`))).rows[0].status === "cancelled");

await check("nothing was deleted — data survives cancellation", async () =>
  (await as(ADMIN, () => db.query(`select count(*)::int c from public.handover_pack`))).rows[0].c === 1);

await rejects("cancelling twice is refused", () =>
  as(ADMIN, () => db.query(`select public.cancel_member('${ALICE}')`)), "already cancelled");

await as(ADMIN, () => db.query(
  `select public.rejoin_member('${ALICE}', now(), now(), 6::smallint, '2026-09-01'::date)`));

await check("rejoin returns them to onboarding, not active", async () =>
  (await as(ADMIN, () => db.query(`select status from public.members where id='${ALICE}'`))).rows[0].status === "onboarding");

await check("rejoin clears the welcome session gate", async () =>
  (await as(ADMIN, () => db.query(
    `select welcome_session_watched_at is null n from public.members where id='${ALICE}'`))).rows[0].n === true);

await check("rejoin starts a fresh 6-month term", async () =>
  (await as(ADMIN, () => db.query(
    `select contract_term_end_date::text d from public.members where id='${ALICE}'`))).rows[0].d === "2027-03-01");

await check("join_date survives — 'member since' still true", async () =>
  (await as(ADMIN, () => db.query(
    `select join_date::text d from public.members where id='${ALICE}'`))).rows[0].d === "2026-01-15");

await check("REJOINED member in onboarding still sees their old handover pack", async () =>
  (await as(ALICE, () => db.query(`select count(*)::int c from public.handover_pack`))).rows[0].c === 1);

await check("is_returning_member is true after a rejoin", async () =>
  (await as(ADMIN, () => db.query(`select public.is_returning_member('${ALICE}') r`))).rows[0].r === true);

console.log("\n— directory —");

await rejects("even an admin cannot insert a member directly — must use create_member()", () =>
  as(ADMIN, () => db.query(
    `insert into public.members (id, email, full_name, status) values ('${BOB}','bob@test','Bob','active')`)),
  "row-level security");

await as(ADMIN, () => db.query(`select public.create_member('${BOB}','bob@test','Bob')`));
await as(ADMIN, () => db.query(`update public.members set status='active' where id='${BOB}'`));
await as(BOB, () => db.query(
  `insert into public.member_profiles (member_id, display_name, title, bio, completed_at)
   values ('${BOB}','Bob Smith','Fractional COO','I help agencies fix delivery.', now())`));

await check("members can find each other in the directory", async () =>
  (await as(ALICE, () => db.query(
    `select count(*)::int c from public.member_profiles
     where search_vector @@ plainto_tsquery('english','agencies')`))).rows[0].c === 1);

await check("incomplete listings stay hidden", async () => {
  await as(ALICE, () => db.query(
    `insert into public.member_profiles (member_id, display_name) values ('${ALICE}','Alice')`));
  const r = await as(BOB, () => db.query(`select count(*)::int c from public.member_profiles`));
  return r.rows[0].c === 1; // Bob sees only his own
});

console.log("\n— pairing —");

const P = (await db.query(`insert into public.pairings (pairing_month) values ('2026-04-01') returning id`)).rows[0].id;
await db.exec(`insert into public.pairing_participants (pairing_id, member_id, pairing_month)
               values ('${P}','${ALICE}','2000-01-01'), ('${P}','${BOB}','2000-01-01')`);

await check("participant month is synced from the pairing", async () =>
  (await db.query(`select distinct pairing_month::text d from public.pairing_participants`)).rows[0].d === "2026-04-01");

await rejects("a member cannot be in two pairings the same month", async () => {
  const p2 = (await db.query(`insert into public.pairings (pairing_month) values ('2026-04-01') returning id`)).rows[0].id;
  await db.exec(`insert into public.pairing_participants (pairing_id, member_id, pairing_month) values ('${p2}','${BOB}','2026-04-01')`);
}, "duplicate key");

await check("a member sees their own pairing", async () =>
  (await as(BOB, () => db.query(`select count(*)::int c from public.pairings`))).rows[0].c === 1);

await check("a member sees who their partner is", async () =>
  (await as(BOB, () => db.query(`select count(*)::int c from public.pairing_participants`))).rows[0].c === 2);

console.log("\n— storage buckets —");

// Alice is cancelled by this point in the run; Bob is active.
await check("a member uploads a headshot into their own folder", async () => {
  await as(BOB, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('headshots','${BOB}/me.jpg')`));
  const r = await as(BOB, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='headshots'`));
  return r.rows[0].c === 1;
});

await rejects("a member cannot upload into someone else's folder", () =>
  as(BOB, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('headshots','${ADMIN}/sneaky.jpg')`)),
  "row-level security");

await check("headshots are readable by anyone with portal access", async () =>
  (await as(ADMIN, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='headshots'`))).rows[0].c === 1);

// Alice was rejoined earlier in the run, so she is onboarding — which is exactly
// the case §1 says SHOULD see the directory. Cancel Dana to test the real gate.
await check("an onboarding member CAN read headshots — the directory is open from day one", async () =>
  (await as(DANA, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='headshots'`))).rows[0].c === 1);

await check("a cancelled member cannot read headshots", async () => {
  await as(ADMIN, () => db.query(`select public.cancel_member('${DANA}')`));
  const r = await as(DANA, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='headshots'`));
  return r.rows[0].c === 0;
});

await check("a voice message is readable by its sender", async () => {
  await as(BOB, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('voice-messages','${BOB}/note.webm')`));
  const r = await as(BOB, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='voice-messages'`));
  return r.rows[0].c === 1;
});

await check("an admin can read any voice message", async () =>
  (await as(ADMIN, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='voice-messages'`))).rows[0].c === 1);

await check("another member cannot read someone else's voice message", async () => {
  // The gap this documents: a RECIPIENT is another member, so as specified they
  // cannot hear a note sent to them. Needs a recipient clause once chat exists.
  const r = await as(ALICE, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='voice-messages'`));
  return r.rows[0].c === 0;
});

await check("a sent voice message cannot be overwritten", async () => {
  // No UPDATE policy exists for members on this bucket. RLS refuses an UPDATE by
  // matching no rows rather than raising — so this asserts the value is
  // unchanged. A test expecting an exception would pass against a policy that
  // did nothing at all.
  await as(BOB, () => db.query(
    `update storage.objects set name='${BOB}/replaced.webm' where bucket_id='voice-messages'`));
  const r = await as(ADMIN, () => db.query(
    `select name from storage.objects where bucket_id='voice-messages'`));
  return r.rows[0].name === `${BOB}/note.webm`;
});

await check("training content files are unreadable by members, by design", async () => {
  // §11: no member policy on this bucket at all. Reads go through the app,
  // which mints a signed URL after checking the member may see that item — so a
  // SELECT policy here would quietly reopen what the rule closes.
  await db.exec(
    `insert into storage.objects (bucket_id, name) values ('training-content','lesson-one.mp4')`,
  );
  const asMember = await as(BOB, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='training-content'`));
  const asAdmin = await as(ADMIN, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='training-content'`));
  return asMember.rows[0].c === 0 && asAdmin.rows[0].c === 1;
});

await rejects("a member cannot upload into the training bucket", () =>
  as(BOB, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('training-content','${BOB}/mine.mp4')`)),
  "row-level security");

console.log("\n— station visits —");

await check("recording a visit creates it, then increments", async () => {
  const read = () => as(BOB, () => db.query(
    `select visit_count, first_visited_at, last_visited_at
     from public.station_visits where station_slug='terrazza'`));

  await as(BOB, () => db.query(`select public.record_station_visit('terrazza')`));
  const first = (await read()).rows[0];
  await as(BOB, () => db.query(`select public.record_station_visit('terrazza')`));
  const second = (await read()).rows[0];

  // Counted twice, and the first visit preserved rather than overwritten.
  //
  // Asserted as "first_visited_at did not change" rather than "the two
  // timestamps differ". now() is the transaction clock and PGlite takes it from
  // JS, so two fast calls legitimately land on the same millisecond — the
  // previous version of this failed about four runs in ten for that reason,
  // which is a coin toss wearing the costume of a test.
  return first.visit_count === 1
    && second.visit_count === 2
    && String(second.first_visited_at) === String(first.first_visited_at)
    && second.last_visited_at >= second.first_visited_at;
});

await check("a member sees only their own visits", async () => {
  const r = await as(DANA, () => db.query(
    `select count(*)::int c from public.station_visits`));
  return r.rows[0].c === 0;
});

await check("a member cannot fabricate a visit", async () => {
  // No INSERT policy: RLS refuses by matching nothing, so this asserts the row
  // is absent rather than expecting a throw.
  try {
    await as(BOB, () => db.query(
      `insert into public.station_visits (member_id, station_slug)
       values ('${BOB}','archivio')`));
  } catch {
    // Either outcome is fine; what matters is the row not existing.
  }
  const r = await as(BOB, () => db.query(
    `select count(*)::int c from public.station_visits where station_slug='archivio'`));
  return r.rows[0].c === 0;
});

console.log("\n— monthly draw —");

// February 2026 has exactly four Mondays; March has five. Both are asserted,
// because "a full month" being four weeks is the assumption that would quietly
// hand out an entry for a five-week month somebody didn't complete.
await check("weeks_in_month counts the Mondays — four in Feb 2026", async () =>
  (await as(ADMIN, () => db.query(
    `select public.weeks_in_month('2026-02-01'::date) w`))).rows[0].w === 4);

await check("weeks_in_month — five in Mar 2026", async () =>
  (await as(ADMIN, () => db.query(
    `select public.weeks_in_month('2026-03-01'::date) w`))).rows[0].w === 5);

// Bob is active by this point; Alice has rejoined and is back to onboarding.
// One 11-hour entry in each of February's four weeks clears the 10-hour bar.
await as(BOB, () => db.query(`
  insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
    ('${BOB}','client-sessions','2026-02-02 09:00Z','2026-02-02 20:00Z'),
    ('${BOB}','client-sessions','2026-02-09 09:00Z','2026-02-09 20:00Z'),
    ('${BOB}','client-sessions','2026-02-16 09:00Z','2026-02-16 20:00Z'),
    ('${BOB}','client-sessions','2026-02-23 09:00Z','2026-02-23 20:00Z')`));

await check("a member reads their own completed weeks", async () =>
  (await as(BOB, () => db.query(
    `select public.complete_weeks_in_month('${BOB}','2026-02-01'::date) c`))).rows[0].c === 4);

await rejects("a member cannot read someone else's completed weeks", () =>
  as(ALICE, () => db.query(
    `select public.complete_weeks_in_month('${BOB}','2026-02-01'::date)`)),
  "Only an admin");

await check("eligibility: four of four weeks puts Bob in", async () => {
  const r = await as(ADMIN, () => db.query(
    `select complete_weeks, weeks_required, is_eligible
     from public.draw_eligibility('2026-02-01'::date) where member_id='${BOB}'`));
  const row = r.rows[0];
  return row.complete_weeks === 4 && row.weeks_required === 4 && row.is_eligible === true;
});

await check("eligibility: the same four weeks are NOT a full March", async () => {
  // Bob logged nothing in March, so this is really asserting the bar moves with
  // the month rather than being a fixed four.
  const r = await as(ADMIN, () => db.query(
    `select weeks_required, is_eligible
     from public.draw_eligibility('2026-03-01'::date) where member_id='${BOB}'`));
  return r.rows[0].weeks_required === 5 && r.rows[0].is_eligible === false;
});

await check("eligibility lists active members only — no onboarding, no cancelled", async () => {
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.draw_eligibility('2026-02-01'::date)
     where member_id='${ALICE}'`));
  return r.rows[0].c === 0;
});

await check("the admin running the draw is not in it", async () => {
  // Nina's row is `status = 'active'` like everyone else's; `role` is what
  // separates her. Filtering on status alone put her in the hat for a prize
  // she's giving away.
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.draw_eligibility('2026-02-01'::date)
     where member_id='${ADMIN}'`));
  return r.rows[0].c === 0;
});

await rejects("a member cannot read the eligibility list", () =>
  as(BOB, () => db.query(`select * from public.draw_eligibility('2026-02-01'::date)`)),
  "Only an admin");

await as(ADMIN, () => db.query(`
  insert into public.draws (id, draw_month, prize, draw_date) values
    ('55555555-5555-5555-5555-555555555555','2026-02-01','A year of Canva Pro','2026-03-03'),
    ('66666666-6666-6666-6666-666666666666','2026-03-01','Nothing yet','2026-04-03')`));

const FEB_DRAW = "55555555-5555-5555-5555-555555555555";
const MAR_DRAW = "66666666-6666-6666-6666-666666666666";

await check("opening entries enters the eligible members", async () =>
  (await as(ADMIN, () => db.query(
    `select public.open_draw_entries('${FEB_DRAW}') n`))).rows[0].n === 1);

await check("the entry records the weeks that earned it", async () =>
  (await as(ADMIN, () => db.query(
    `select complete_weeks c from public.draw_entries
     where draw_id='${FEB_DRAW}' and member_id='${BOB}'`))).rows[0].c === 4);

await check("opening entries again adds nobody twice", async () =>
  (await as(ADMIN, () => db.query(
    `select public.open_draw_entries('${FEB_DRAW}') n`))).rows[0].n === 0);

await rejects("a member cannot open entries", () =>
  as(BOB, () => db.query(`select public.open_draw_entries('${FEB_DRAW}')`)),
  "Only an admin");

await rejects("a draw nobody entered refuses to pick a winner", () =>
  as(ADMIN, () => db.query(`select public.draw_winner('${MAR_DRAW}')`)),
  "Nobody is entered");

await check("drawing picks a winner from the entrants", async () =>
  (await as(ADMIN, () => db.query(
    `select (public.draw_winner('${FEB_DRAW}')).winner_member_id w`))).rows[0].w === BOB);

// The one that actually matters: a retried request must not produce a second,
// different winner.
await rejects("a drawn draw cannot be drawn again", () =>
  as(ADMIN, () => db.query(`select public.draw_winner('${FEB_DRAW}')`)),
  "already has a winner");

await rejects("entries cannot be reopened after the draw", () =>
  as(ADMIN, () => db.query(`select public.open_draw_entries('${FEB_DRAW}')`)),
  "already been drawn");

await check("a member sees their own entry, not the entrant list", async () => {
  const mine = await as(BOB, () => db.query(
    `select count(*)::int c from public.draw_entries`));
  const theirs = await as(ALICE, () => db.query(
    `select count(*)::int c from public.draw_entries`));
  return mine.rows[0].c === 1 && theirs.rows[0].c === 0;
});

await check("the draw itself is visible to members — prize and date are furniture", async () =>
  (await as(BOB, () => db.query(
    `select count(*)::int c from public.draws`))).rows[0].c === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
