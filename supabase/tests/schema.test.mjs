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

console.log("\n— hours reclaimed —");

// A member of their own: Alice has been cancelled and rejoined, Dana was
// cancelled for the storage tests, and Bob's February is spoken for by the draw.
// Accrual needs someone with a clean history and live portal access.
const ERIN = "99999999-9999-9999-9999-999999999999";
// An id with no directory listing, for the "not listed at all" case.
const OMAR_LIKE = "14141414-1414-1414-1414-141414141414";
const ERIN_WEEK = "2026-05-04"; // a Monday

await db.exec(`insert into auth.users (id, email) values ('${ERIN}', 'erin@test')`);
await as(ADMIN, () => db.query(
  `select public.create_member('${ERIN}','erin@test','Erin Vale', now(), now())`));
await as(ADMIN, () => db.query(`select public.activate_member('${ERIN}')`));

await as(ADMIN, () => db.query(`
  insert into public.handover_pack (id, member_id, title, source)
  values ('77777777-7777-7777-7777-777777777777','${ERIN}','Enquiry follow-up','hot_seat'),
         ('88888888-8888-8888-8888-888888888888','${ERIN}','Invoice chasing','hot_seat')`));

const FOLLOW_UP = "77777777-7777-7777-7777-777777777777";
const INVOICES = "88888888-8888-8888-8888-888888888888";

await check("setting a rate opens a period that is still running", async () => {
  await as(ADMIN, () => db.query(
    `select public.set_build_rate('${FOLLOW_UP}', 5, '2026-05-01'::date, null)`));
  const r = await as(ADMIN, () => db.query(
    `select hours_per_week::float h, effective_until from public.handover_pack_rates
     where handover_pack_id='${FOLLOW_UP}'`));
  return r.rows.length === 1 && r.rows[0].h === 5 && r.rows[0].effective_until === null;
});

await rejects("a member cannot decide what their own build is worth", () =>
  as(ERIN, () => db.query(
    `select public.set_build_rate('${FOLLOW_UP}', 99, '2026-05-01'::date, null)`)),
  "Only an admin");

await check("a same-day correction edits the period rather than splitting it", async () => {
  await as(ADMIN, () => db.query(
    `select public.set_build_rate('${FOLLOW_UP}', 4, '2026-05-01'::date, null)`));
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c, max(hours_per_week)::float h from public.handover_pack_rates
     where handover_pack_id='${FOLLOW_UP}'`));
  return r.rows[0].c === 1 && r.rows[0].h === 4;
});

// Round 2, D (14 Sep 2026): the ledger no longer looks at tracked hours or the
// submitted log. Until then this test was "a week under ten hours earns
// nothing at all", and the one after it needed ten hours and a submission to
// earn the rate. Both rewritten to the confirmed rule; the old gate lives on
// only in the draw, tested under "monthly draw".
await check("a week with an active build earns its rate, whatever was logged", async () => {
  // Five hours logged, and a submission. Under the old rule: nothing. Now: 4.
  await as(ERIN, () => db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at)
    values ('${ERIN}','client-sessions','${ERIN_WEEK} 09:00Z','${ERIN_WEEK} 14:00Z')`));
  await as(ERIN, () => db.query(`
    insert into public.weekly_submissions (member_id, week_start_date, submitted_at)
    values ('${ERIN}','${ERIN_WEEK}', now())`));

  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','${ERIN_WEEK}'::date)::float h`));
  const ledger = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.hours_ledger where member_id='${ERIN}'`));
  return r.rows[0].h === 4 && ledger.rows[0].c === 1;
});

await check("logging more that week changes nothing: the rate is the rate", async () => {
  await as(ERIN, () => db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at)
    values ('${ERIN}','sales-calls','2026-05-05 09:00Z','2026-05-05 15:00Z')`));

  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','${ERIN_WEEK}'::date)::float h`));
  return r.rows[0].h === 4;
});

await check("running it again changes nothing — safe to re-run and backfill", async () => {
  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','${ERIN_WEEK}'::date)::float h`));
  const ledger = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.hours_ledger where member_id='${ERIN}'`));
  return r.rows[0].h === 4 && ledger.rows[0].c === 1;
});

await check("the week records what the number was made of", async () => {
  const r = await as(ADMIN, () => db.query(
    `select breakdown from public.hours_ledger
     where member_id='${ERIN}' and week_start_date='${ERIN_WEEK}'`));
  const breakdown = r.rows[0].breakdown;
  return breakdown.length === 1 && breakdown[0].title === "Enquiry follow-up";
});

await check("a second build stacks rather than replacing the first", async () => {
  await as(ADMIN, () => db.query(
    `select public.set_build_rate('${INVOICES}', 3, '2026-05-01'::date, null)`));
  // A different qualifying week, since the first is already banked.
  await as(ERIN, () => db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
      ('${ERIN}','client-sessions','2026-05-11 09:00Z','2026-05-11 17:00Z'),
      ('${ERIN}','sales-calls',    '2026-05-12 09:00Z','2026-05-12 12:00Z')`));
  await as(ERIN, () => db.query(`
    insert into public.weekly_submissions (member_id, week_start_date, submitted_at)
    values ('${ERIN}','2026-05-11', now())`));

  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','2026-05-11'::date)::float h`));
  return r.rows[0].h === 7;
});

await rejects("a build cannot have two rates running at once", () =>
  as(ADMIN, () => db.query(`
    insert into public.handover_pack_rates (handover_pack_id, hours_per_week, effective_from)
    values ('${FOLLOW_UP}', 9, '2026-06-01')`)),
  "duplicate key");

await check("revising a rate closes the old period instead of overwriting it", async () => {
  await as(ADMIN, () => db.query(
    `select public.set_build_rate('${FOLLOW_UP}', 2, '2026-06-01'::date, 'Halved after review')`));
  const r = await as(ADMIN, () => db.query(
    `select hours_per_week::float h, effective_from::text f, effective_until::text u
     from public.handover_pack_rates where handover_pack_id='${FOLLOW_UP}'
     order by effective_from`));
  return r.rows.length === 2
    && r.rows[0].h === 4 && r.rows[0].u === "2026-06-01"
    && r.rows[1].h === 2 && r.rows[1].u === null;
});

// The promise §2 makes explicitly: already-accrued hours never shrink.
await check("a week already banked keeps its old rate after a revision", async () => {
  const r = await as(ADMIN, () => db.query(
    `select hours::float h from public.hours_ledger
     where member_id='${ERIN}' and week_start_date='${ERIN_WEEK}'`));
  return r.rows[0].h === 4;
});

await check("retiring a build stops it earning and takes nothing back", async () => {
  const before = await as(ADMIN, () => db.query(
    `select coalesce(sum(hours),0)::float t from public.hours_ledger where member_id='${ERIN}'`));

  await as(ADMIN, () => db.query(
    `select public.retire_build_rate('${INVOICES}', '2026-07-01'::date)`));

  const after = await as(ADMIN, () => db.query(
    `select coalesce(sum(hours),0)::float t from public.hours_ledger where member_id='${ERIN}'`));
  const open = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.handover_pack_rates
     where handover_pack_id='${INVOICES}' and effective_until is null`));

  return after.rows[0].t === before.rows[0].t && open.rows[0].c === 0;
});

await check("a rate that starts after the week doesn't count towards it", async () => {
  // FOLLOW_UP dropped to 2 from 1 June; INVOICES retired from 1 July. A third
  // build starts earning in September — deliberately after the week under test,
  // because otherwise the retired-and-superseded rates alone would carry this
  // and it would pass without the start date being consulted at all.
  await as(ADMIN, () => db.query(`
    insert into public.handover_pack (id, member_id, title, source)
    values ('12121212-1212-1212-1212-121212121212','${ERIN}','Not yet running','hot_seat')`));
  await as(ADMIN, () => db.query(
    `select public.set_build_rate('12121212-1212-1212-1212-121212121212', 6, '2026-09-01'::date, null)`));

  await as(ERIN, () => db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
      ('${ERIN}','client-sessions','2026-08-03 09:00Z','2026-08-03 20:00Z')`));
  await as(ERIN, () => db.query(`
    insert into public.weekly_submissions (member_id, week_start_date, submitted_at)
    values ('${ERIN}','2026-08-03', now())`));

  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','2026-08-03'::date)::float h`));
  // 2, not 8: September's build hasn't started earning yet.
  return r.rows[0].h === 2;
});

await check("...and does count once its start date has passed", async () => {
  await as(ERIN, () => db.query(`
    insert into public.time_entries (member_id, category_slug, started_at, ended_at) values
      ('${ERIN}','client-sessions','2026-09-07 09:00Z','2026-09-07 20:00Z')`));
  await as(ERIN, () => db.query(`
    insert into public.weekly_submissions (member_id, week_start_date, submitted_at)
    values ('${ERIN}','2026-09-07', now())`));

  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','2026-09-07'::date)::float h`));
  return r.rows[0].h === 8;
});

await check("a week with nothing logged and no submission still earns the rate", async () => {
  // Nothing in time_entries for this week, no weekly_submissions row. Under
  // the old rule this returned null; now the build is live, so it accrues.
  const r = await as(ADMIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','2026-08-10'::date)::float h`));
  const ledger = await as(ADMIN, () => db.query(
    `select hours::float h from public.hours_ledger where member_id='${ERIN}' and week_start_date='2026-08-10'`));
  return r.rows[0].h !== null && ledger.rows[0].h === r.rows[0].h;
});

await check("a member sees their own ledger and nobody else's", async () => {
  const mine = await as(ERIN, () => db.query(
    `select count(*)::int c from public.hours_ledger`));
  const theirs = await as(BOB, () => db.query(
    `select count(*)::int c from public.hours_ledger`));
  return mine.rows[0].c > 0 && theirs.rows[0].c === 0;
});

await check("a member cannot write to the ledger", async () => {
  try {
    await as(ERIN, () => db.query(`
      insert into public.hours_ledger (member_id, week_start_date, hours)
      values ('${ERIN}','2026-09-07', 999)`));
  } catch {
    // Either outcome is fine; what matters is the row not existing.
  }
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.hours_ledger where hours = 999`));
  return r.rows[0].c === 0;
});

await rejects("a member cannot accrue their own hours", () =>
  as(ERIN, () => db.query(
    `select public.accrue_hours_for_week('${ERIN}','2026-08-03'::date)`)),
  "Only an admin");

console.log("\n— chat —");

// ERIN is active with builds already in her handover pack, so check-in messages
// have something real to be tagged to. FRAN is a second active member for DMs.
const FRAN = "13131313-1313-1313-1313-131313131313";
await db.exec(`insert into auth.users (id, email) values ('${FRAN}', 'fran@test')`);
await as(ADMIN, () => db.query(
  `select public.create_member('${FRAN}','fran@test','Fran Doyle', now(), now())`));
await as(ADMIN, () => db.query(`select public.activate_member('${FRAN}')`));

const generalId = async () => (await as(ERIN, () => db.query(
  `select id from public.chat_channels where slug='general'`))).rows[0].id;

await check("the three open channels are seeded and visible to members", async () => {
  const r = await as(ERIN, () => db.query(
    `select slug from public.chat_channels where kind='group' order by sort_order`));
  return r.rows.map((x) => x.slug).join(",") === "general,wins,time-tracking";
});

await check("an onboarding member can reach chat — it isn't locked until active", async () => {
  // ALICE was rejoined earlier and is back in onboarding. §1 locks the library,
  // hot seat, pairing and the draw; Piazza Sociale is open from day one.
  const r = await as(ALICE, () => db.query(
    `select count(*)::int c from public.chat_channels where kind='group'`));
  return r.rows[0].c === 3;
});

await check("a cancelled member reaches nothing", async () => {
  const r = await as(DANA, () => db.query(
    `select count(*)::int c from public.chat_channels`));
  return r.rows[0].c === 0;
});

await check("a member posts to an open channel", async () => {
  const id = await generalId();
  await as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${id}','${ERIN}','Morning all')`));
  const r = await as(FRAN, () => db.query(
    `select count(*)::int c from public.chat_messages where channel_id='${id}'`));
  return r.rows[0].c === 1;
});

await rejects("a member cannot post as somebody else", async () => {
  const id = await generalId();
  return as(FRAN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${id}','${ERIN}','Not me')`));
}, "row-level security");

await rejects("a message must actually say something", async () => {
  const id = await generalId();
  return as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${id}','${ERIN}','   ')`));
}, "chat_messages_has_content");

await rejects("a voice message without a duration is refused", async () => {
  const id = await generalId();
  return as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, voice_path)
     values ('${id}','${ERIN}','${ERIN}/note.webm')`));
}, "chat_messages_voice_is_complete");

await check("a voice message with a duration is fine, with no text at all", async () => {
  const id = await generalId();
  await as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, voice_path, voice_seconds)
     values ('${id}','${ERIN}','${ERIN}/note.webm', 42)`));
  const r = await as(ERIN, () => db.query(
    `select voice_seconds from public.chat_messages where voice_path='${ERIN}/note.webm'`));
  return r.rows[0].voice_seconds === 42;
});

await check("a sent message cannot be edited, even by its author", async () => {
  try {
    await as(ERIN, () => db.query(
      `update public.chat_messages set body='rewritten' where member_id='${ERIN}'`));
  } catch {
    // No update policy: RLS may refuse outright or simply match nothing.
  }
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_messages where body='rewritten'`));
  return r.rows[0].c === 0;
});

await check("a check-in response is tagged to the build it's about", async () => {
  const id = await generalId();
  await as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body, handover_pack_id)
     values ('${id}','${ERIN}','Two weeks in, it is holding up','${FOLLOW_UP}')`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_messages
     where handover_pack_id='${FOLLOW_UP}'`));
  return r.rows[0].c === 1;
});

await check("consent is off unless it is deliberately given", async () => {
  const r = await as(ERIN, () => db.query(
    `select bool_or(testimonial_consent) any_consent from public.chat_messages
     where member_id='${ERIN}'`));
  return r.rows[0].any_consent === false;
});

await rejects("consent cannot be given without a build to consent about", async () => {
  const id = await generalId();
  return as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body, testimonial_consent)
     values ('${id}','${ERIN}','Reuse this', true)`));
}, "chat_messages_consent_needs_a_build");

await check("opening a DM twice returns the same channel, not two", async () => {
  const first = await as(ERIN, () => db.query(
    `select public.open_direct_channel('${FRAN}') id`));
  const second = await as(FRAN, () => db.query(
    `select public.open_direct_channel('${ERIN}') id`));
  return first.rows[0].id === second.rows[0].id;
});

await rejects("you cannot DM yourself", () =>
  as(ERIN, () => db.query(`select public.open_direct_channel('${ERIN}')`)),
  "cannot open a direct message with yourself");

await rejects("you cannot DM a cancelled member", () =>
  as(ERIN, () => db.query(`select public.open_direct_channel('${DANA}')`)),
  "not reachable");

await check("a DM is invisible to everyone outside it", async () => {
  const dm = (await as(ERIN, () => db.query(
    `select public.open_direct_channel('${FRAN}') id`))).rows[0].id;
  await as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${dm}','${ERIN}','Just between us')`));

  const mine = await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_messages where channel_id='${dm}'`));
  const theirs = await as(FRAN, () => db.query(
    `select count(*)::int c from public.chat_messages where channel_id='${dm}'`));
  const outsider = await as(BOB, () => db.query(
    `select count(*)::int c from public.chat_messages where channel_id='${dm}'`));
  const channel = await as(BOB, () => db.query(
    `select count(*)::int c from public.chat_channels where id='${dm}'`));

  return mine.rows[0].c === 1 && theirs.rows[0].c === 1
    && outsider.rows[0].c === 0 && channel.rows[0].c === 0;
});

await rejects("an outsider cannot post into a DM they can't see", async () => {
  const dm = (await as(ERIN, () => db.query(
    `select public.open_direct_channel('${FRAN}') id`))).rows[0].id;
  return as(BOB, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${dm}','${BOB}','Butting in')`));
}, "row-level security");

console.log("\n— chat read state —");

await check("marking read creates a marker", async () => {
  const id = await generalId();
  await as(ERIN, () => db.query(`select public.mark_channel_read('${id}')`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_reads
     where channel_id='${id}' and member_id='${ERIN}'`));
  return r.rows[0].c === 1;
});

await check("a read marker only ever moves forward", async () => {
  const id = await generalId();

  // A marker ahead of now() stands in for the race this guards: now() is
  // transaction-start time, so two overlapping transactions can commit out of
  // order and write an older value last. That can't be reproduced on demand;
  // this asserts the same semantics — an older timestamp never wins.
  await as(ERIN, () => db.query(
    `update public.chat_reads set last_read_at = now() + interval '1 hour'
     where channel_id='${id}' and member_id='${ERIN}'`));
  const ahead = await as(ERIN, () => db.query(
    `select last_read_at from public.chat_reads
     where channel_id='${id}' and member_id='${ERIN}'`));

  await as(ERIN, () => db.query(`select public.mark_channel_read('${id}')`));

  const after = await as(ERIN, () => db.query(
    `select last_read_at from public.chat_reads
     where channel_id='${id}' and member_id='${ERIN}'`));
  return String(after.rows[0].last_read_at) === String(ahead.rows[0].last_read_at);
});

await check("a member cannot mark a channel they can't see", async () => {
  const dm = (await as(ERIN, () => db.query(
    `select public.open_direct_channel('${FRAN}') id`))).rows[0].id;
  await as(BOB, () => db.query(`select public.mark_channel_read('${dm}')`));
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.chat_reads where channel_id='${dm}' and member_id='${BOB}'`));
  return r.rows[0].c === 0;
});

await check("a member sees only their own read markers", async () => {
  const mine = await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_reads`));
  const theirs = await as(BOB, () => db.query(
    `select count(*)::int c from public.chat_reads`));
  return mine.rows[0].c > 0 && theirs.rows[0].c === 0;
});

await check("due_jobs can now be due at a moment, not just on a day", async () => {
  // Written without a role, mirroring the cron's service-role client — the
  // queue is machine-owned and has no policy for anyone signed in.
  await db.query(`
    insert into public.due_jobs (kind, member_id, due_on, due_at, dedupe_key)
    values ('chat_unread','${ERIN}', current_date, now() + interval '1 hour', 'test:at')`);
  const r = await db.query(
    `select due_at is not null h from public.due_jobs where dedupe_key='test:at'`);
  return r.rows[0].h === true;
});

await check("nobody signed in can write to the job queue, admins included", async () => {
  for (const who of [ERIN, ADMIN]) {
    try {
      await as(who, () => db.query(`
        insert into public.due_jobs (kind, member_id, due_on, dedupe_key)
        values ('chat_unread','${ERIN}', current_date, 'test:forged:${'${who}'}')`));
    } catch {
      // Either outcome is fine; what matters is no row appearing.
    }
  }
  const r = await db.query(
    `select count(*)::int c from public.due_jobs where dedupe_key like 'test:forged%'`);
  return r.rows[0].c === 0;
});

console.log("\n— display names —");

await check("a member can resolve another member's name", async () => {
  const r = await as(ERIN, () => db.query(
    `select display_name from public.display_names(array['${FRAN}']::uuid[])`));
  return r.rows[0]?.display_name === "Fran Doyle";
});

// The actual bug: Nina is an admin with no directory listing, so a name read
// from member_profiles alone finds nothing and the UI says "A member".
await check("an admin with no directory listing still has a name", async () => {
  const r = await as(ERIN, () => db.query(
    `select display_name from public.display_names(array['${ADMIN}']::uuid[])`));
  return r.rows[0]?.display_name === "Nina";
});

await check("a completed directory listing wins over the account name", async () => {
  await as(FRAN, () => db.query(`
    insert into public.member_profiles (member_id, display_name, completed_at)
    values ('${FRAN}', 'Fran at Doyle & Co', now())`));
  const r = await as(ERIN, () => db.query(
    `select display_name from public.display_names(array['${FRAN}']::uuid[])`));
  return r.rows[0]?.display_name === "Fran at Doyle & Co";
});

await check("names are all it returns — the rest of the row stays private", async () => {
  // The reason this is a function and not a policy: RLS is row-level, so
  // letting members read each other's names would hand over email, status,
  // join date and contract terms with it.
  const direct = await as(ERIN, () => db.query(
    `select count(*)::int c from public.members where id='${FRAN}'`));
  const cols = await as(ERIN, () => db.query(
    `select count(*)::int c from information_schema.columns
     where table_name='display_names'`));
  return direct.rows[0].c === 0 && cols.rows[0].c === 0;
});

await check("a cancelled member resolves nobody", async () => {
  const r = await as(DANA, () => db.query(
    `select count(*)::int c from public.display_names(array['${FRAN}']::uuid[])`));
  return r.rows[0].c === 0;
});

console.log("\n— member directory —");

await as(ERIN, () => db.query(`
  insert into public.member_profiles (member_id, display_name, title, bio, links, completed_at)
  values ('${ERIN}', 'Erin Vale', 'Fractional operations lead',
          'I fix delivery for agencies drowning in client admin.',
          '[{"label":"Work with me","url":"https://example.test/erin"}]'::jsonb, now())`));

// Fran's listing was completed earlier in the display-names block; give her
// something searchable that doesn't overlap with Erin's wording.
await as(FRAN, () => db.query(`
  update public.member_profiles
  set title = 'Brand photographer', bio = 'Portraits for founders who hate being photographed.'
  where member_id = '${FRAN}'`));

await check("a member sees other members' completed listings", async () => {
  const r = await as(FRAN, () => db.query(
    `select count(*)::int c from public.member_profiles where member_id='${ERIN}'`));
  return r.rows[0].c === 1;
});

await check("an owner can still read their own incomplete listing", async () => {
  // Alice's half-finished row already exists from the tiering tests above, and
  // "incomplete listings stay hidden" covers the hiding. The other half matters
  // just as much: a listing hidden from its own author is one they can never
  // come back and finish.
  const theirs = await as(ERIN, () => db.query(
    `select count(*)::int c from public.member_profiles where member_id='${ALICE}'`));
  const own = await as(ALICE, () => db.query(
    `select count(*)::int c from public.member_profiles where member_id='${ALICE}'`));
  return theirs.rows[0].c === 0 && own.rows[0].c === 1;
});

await check("search matches on the bio, not just the name", async () => {
  const r = await as(FRAN, () => db.query(
    `select display_name from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'drowning')`));
  return r.rows.length === 1 && r.rows[0].display_name === 'Erin Vale';
});

await check("search matches on 'what my business is all about' too", async () => {
  await as(ERIN, () => db.query(
    `update public.member_profiles set business_about = 'Fractional operations for boutique gyms'
     where member_id='${ERIN}'`));
  const r = await as(FRAN, () => db.query(
    `select display_name from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'gyms')`));
  return r.rows.length === 1 && r.rows[0].display_name === 'Erin Vale';
});

await check("a search term shared by two listings returns both", async () => {
  // Erin and Bob both mention agencies. A directory that silently returned one
  // of them would be worse than useless.
  const r = await as(FRAN, () => db.query(
    `select count(*)::int c from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'agencies')`));
  return r.rows[0].c === 2;
});

await check("search matches on the title", async () => {
  const r = await as(ERIN, () => db.query(
    `select display_name from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'photographer')`));
  return r.rows.length === 1 && r.rows[0].display_name.includes('Fran');
});

await check("search stems, so 'photograph' finds 'photographer'", async () => {
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'photograph')`));
  return r.rows[0].c === 1;
});

await check("an apostrophe in the search box doesn't throw", async () => {
  // websearch_to_tsquery takes what a person actually types. Raw to_tsquery
  // would raise a syntax error here, and a search box that errors on "founder's"
  // is worse than one that finds nothing.
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'founder''s hate')`));
  return typeof r.rows[0].c === "number";
});

await check("search never reaches an incomplete listing", async () => {
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.member_profiles
     where search_vector @@ websearch_to_tsquery('english', 'half-written')`));
  return r.rows[0].c === 0;
});

await check("a cancelled member sees no directory at all", async () => {
  const r = await as(DANA, () => db.query(
    `select count(*)::int c from public.member_profiles`));
  return r.rows[0].c === 0;
});

// The three states the "you're not listed yet" card reads. All three are the
// same policy — an owner reads their own row complete or not — but the card
// says something different for each, and getting them the wrong way round
// would tell a listed member they're invisible.
await check("an account with no listing at all reads as none", async () => {
  const r = await as(BOB, () => db.query(
    `select count(*)::int c from public.member_profiles where member_id='${OMAR_LIKE}'`));
  return r.rows[0].c === 0;
});

await check("a started-but-unfinished listing is readable by its owner", async () => {
  const r = await as(ALICE, () => db.query(
    `select completed_at from public.member_profiles where member_id='${ALICE}'`));
  return r.rows.length === 1 && r.rows[0].completed_at === null;
});

await check("a finished listing reads as complete", async () => {
  const r = await as(ERIN, () => db.query(
    `select completed_at from public.member_profiles where member_id='${ERIN}'`));
  return r.rows.length === 1 && r.rows[0].completed_at !== null;
});

await check("a member cannot edit somebody else's listing", async () => {
  // No throw: the UPDATE policy simply matches no rows, so this asserts the bio
  // is untouched rather than expecting an error.
  await as(FRAN, () => db.query(
    `update public.member_profiles set bio = 'Hijacked' where member_id='${ERIN}'`));
  const r = await as(ERIN, () => db.query(
    `select bio from public.member_profiles where member_id='${ERIN}'`));
  return !r.rows[0].bio.includes("Hijacked");
});

console.log("\n— pairing, what a member may change —");

const PAIR_MONTH = "2026-10-01";
const PAIR_ID = "15151515-1515-1515-1515-151515151515";

await as(ADMIN, () => db.query(`
  insert into public.pairings (id, pairing_month, scheduled_for)
  values ('${PAIR_ID}', '${PAIR_MONTH}', '2026-10-06 14:00Z')`));
await as(ADMIN, () => db.query(`
  insert into public.pairing_participants (pairing_id, member_id, pairing_month)
  values ('${PAIR_ID}', '${ERIN}', '${PAIR_MONTH}'),
         ('${PAIR_ID}', '${FRAN}', '${PAIR_MONTH}')`));

await check("a member confirms they met", async () => {
  await as(ERIN, () => db.query(
    `update public.pairings set met_at = now() where id='${PAIR_ID}'`));
  const r = await as(FRAN, () => db.query(
    `select met_at is not null m from public.pairings where id='${PAIR_ID}'`));
  return r.rows[0].m === true;
});

// The policy allows a member to update their own pairing, and RLS is row-level,
// so without the trigger every column was theirs — including the flag that tells
// Nina a pairing has stalled.
await check("a member can say the call is booked, and take it back", async () => {
  await as(ERIN, () => db.query(
    `update public.pairings set booked_at = now() where id='${PAIR_ID}'`));
  const set = (await as(FRAN, () => db.query(
    `select booked_at is not null b from public.pairings where id='${PAIR_ID}'`))).rows[0].b;
  await as(FRAN, () => db.query(
    `update public.pairings set booked_at = null where id='${PAIR_ID}'`));
  const cleared = (await as(ERIN, () => db.query(
    `select booked_at is null b from public.pairings where id='${PAIR_ID}'`))).rows[0].b;
  return set === true && cleared === true;
});

await check("somebody outside the pairing cannot mark it booked", async () => {
  try {
    await as(BOB, () => db.query(
      `update public.pairings set booked_at = now() where id='${PAIR_ID}'`));
  } catch {
    // RLS matching nothing or raising: either way the value must not change.
  }
  const r = await as(ERIN, () => db.query(
    `select booked_at is null b from public.pairings where id='${PAIR_ID}'`));
  return r.rows[0].b === true;
});

await rejects("a member cannot clear the day-7 flag Nina relies on", async () => {
  await as(ADMIN, () => db.query(
    `update public.pairings set flagged_at = now() where id='${PAIR_ID}'`));
  return as(ERIN, () => db.query(
    `update public.pairings set flagged_at = null where id='${PAIR_ID}'`));
}, "yours to change");

await rejects("a member cannot move the proposed time unilaterally", () =>
  as(ERIN, () => db.query(
    `update public.pairings set scheduled_for = '2026-10-20 09:00Z' where id='${PAIR_ID}'`)),
  "yours to change");

await check("an admin can still set both", async () => {
  await as(ADMIN, () => db.query(`
    update public.pairings set flagged_at = null, scheduled_for = '2026-10-07 10:00Z'
    where id='${PAIR_ID}'`));
  const r = await as(ADMIN, () => db.query(
    `select flagged_at is null f from public.pairings where id='${PAIR_ID}'`));
  return r.rows[0].f === true;
});

await check("somebody outside the pairing cannot touch it at all", async () => {
  try {
    await as(BOB, () => db.query(
      `update public.pairings set met_at = null where id='${PAIR_ID}'`));
  } catch {
    // Either outcome is fine; what matters is met_at surviving.
  }
  const r = await as(ERIN, () => db.query(
    `select met_at is not null m from public.pairings where id='${PAIR_ID}'`));
  return r.rows[0].m === true;
});

await check("availability is private to the member who gave it", async () => {
  await as(ERIN, () => db.query(`
    insert into public.pairing_availability (member_id, pairing_month, availability, submitted_at)
    values ('${ERIN}', '${PAIR_MONTH}', '{"slots":["tue-pm"]}'::jsonb, now())`));

  const mine = await as(ERIN, () => db.query(
    `select count(*)::int c from public.pairing_availability`));
  const theirs = await as(FRAN, () => db.query(
    `select count(*)::int c from public.pairing_availability`));
  const nina = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.pairing_availability`));
  // Their partner can't read it; Nina can, because she runs the matching.
  return mine.rows[0].c === 1 && theirs.rows[0].c === 0 && nina.rows[0].c === 1;
});

await check("either member of a pair can see what they both ticked, and only that", async () => {
  await as(FRAN, () => db.query(`
    insert into public.pairing_availability (member_id, pairing_month, availability, submitted_at)
    values ('${FRAN}', '${PAIR_MONTH}', '{"slots":["tue-pm","thu-am"]}'::jsonb, now())`));
  // ERIN ticked tue-pm only; FRAN ticked tue-pm and thu-am. Shared: tue-pm.
  const erin = (await as(ERIN, () => db.query(
    `select public.pairing_shared_slots('${PAIR_ID}') s`))).rows[0].s;
  const fran = (await as(FRAN, () => db.query(
    `select public.pairing_shared_slots('${PAIR_ID}') s`))).rows[0].s;
  return JSON.stringify(erin) === '["tue-pm"]' && JSON.stringify(fran) === '["tue-pm"]';
});

await check("somebody outside the pair gets nothing from it", async () => {
  const r = await as(BOB, () => db.query(
    `select public.pairing_shared_slots('${PAIR_ID}') s`));
  return JSON.stringify(r.rows[0].s) === "[]";
});

console.log("\n— pairing notifications —");

await check("the two new job kinds exist", async () => {
  const r = await db.query(
    `select count(*)::int c from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'due_job_kind' and e.enumlabel in ('pairing_booked','pairing_day7')`);
  return r.rows[0].c === 2;
});

await check("the day-7 flag is only ever set once", async () => {
  // The runner sets it with `is('flagged_at', null)` so a re-run can't produce a
  // second email about the same silence. This asserts the guard the runner leans
  // on, in the database where it actually lives.
  //
  // As the admin, explicitly. This used to run bare and inherit whichever role
  // the previous test left behind — admin, by luck of ordering — until a test
  // added above it ended as a member and the guard trigger refused the update.
  await as(ADMIN, () => db.query(`update public.pairings set flagged_at = null where id='${PAIR_ID}'`));
  await as(ADMIN, () => db.query(
    `update public.pairings set flagged_at = '2026-10-08 09:00Z'
     where id='${PAIR_ID}' and flagged_at is null`));
  await as(ADMIN, () => db.query(
    `update public.pairings set flagged_at = '2026-10-15 09:00Z'
     where id='${PAIR_ID}' and flagged_at is null`));

  const r = await as(ADMIN, () => db.query(
    `select flagged_at::text f from public.pairings where id='${PAIR_ID}'`));
  return r.rows[0].f.startsWith("2026-10-08");
});

await check("a due job can be queued a week ahead", async () => {
  await db.query(`
    insert into public.due_jobs (kind, member_id, due_on, dedupe_key, payload)
    values ('pairing_day7','${ADMIN}', current_date + 7, 'pairing_day7:${PAIR_ID}',
            jsonb_build_object('pairing_id','${PAIR_ID}'))`);
  const r = await db.query(
    `select (due_on > current_date) ahead from public.due_jobs
     where dedupe_key='pairing_day7:${PAIR_ID}'`);
  return r.rows[0].ahead === true;
});

await check("queuing the same pairing twice adds nothing", async () => {
  // dedupe_key is what stops a second matching run double-notifying.
  try {
    await db.query(`
      insert into public.due_jobs (kind, member_id, due_on, dedupe_key)
      values ('pairing_day7','${ADMIN}', current_date + 7, 'pairing_day7:${PAIR_ID}')`);
  } catch {
    // The unique constraint is the point.
  }
  const r = await db.query(
    `select count(*)::int c from public.due_jobs where dedupe_key='pairing_day7:${PAIR_ID}'`);
  return r.rows[0].c === 1;
});

console.log("\n— who the coach is —");

await check("nobody is the coach until somebody is made one", async () => {
  const r = await db.query(`select count(*)::int c from public.members where is_coach`);
  return r.rows[0].c === 0;
});

await check("an admin can be made the coach", async () => {
  await as(ADMIN, () => db.query(
    `update public.members set is_coach = true where id='${ADMIN}'`));
  const r = await as(ADMIN, () => db.query(
    `select is_coach from public.members where id='${ADMIN}'`));
  return r.rows[0].is_coach === true;
});

await rejects("an ordinary member cannot be the coach", () =>
  db.query(`update public.members set is_coach = true where id='${ERIN}'`),
  "members_coach_is_admin");

await rejects("there can only ever be one coach", async () => {
  // A second admin, so the constraint is tested against a row that could
  // otherwise legitimately hold the flag.
  const SECOND = "16161616-1616-1616-1616-161616161616";
  await db.exec(`
    insert into auth.users (id, email) values ('${SECOND}', 'dom@test');
    insert into public.members (id, email, full_name, role, status)
      values ('${SECOND}', 'dom@test', 'Dom', 'admin', 'active')`);
  return db.query(`update public.members set is_coach = true where id='${SECOND}'`);
}, "members_only_one_coach");

// The pairing code reads "the" coach, so two would make that arbitrary again —
// and a member setting it on themselves would hand themselves the coach slot.
await rejects("a member cannot make themselves the coach", () =>
  as(ERIN, () => db.query(
    `update public.members set is_coach = true where id='${ERIN}'`)),
  "Only an admin");

await check("the coach can be handed over", async () => {
  await as(ADMIN, () => db.query(
    `update public.members set is_coach = false where id='${ADMIN}'`));
  await as(ADMIN, () => db.query(
    `update public.members set is_coach = true where id='16161616-1616-1616-1616-161616161616'`));
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.members where is_coach`));
  return r.rows[0].c === 1;
});

console.log("\n— the two-week check-in —");

await check("ensure_direct_channel finds the existing conversation", async () => {
  const first = (await as(ERIN, () => db.query(
    `select public.open_direct_channel('${FRAN}') id`))).rows[0].id;
  // As the service role would call it: both members named, nobody signed in.
  const second = (await db.query(
    `select public.ensure_direct_channel('${ERIN}','${FRAN}') id`)).rows[0].id;
  return first === second;
});

await check("and creates one where there isn't", async () => {
  const before = (await db.query(
    `select count(*)::int c from public.chat_channels where kind='direct'`)).rows[0].c;
  await db.query(`select public.ensure_direct_channel('${ERIN}','${ADMIN}')`);
  const after = (await db.query(
    `select count(*)::int c from public.chat_channels where kind='direct'`)).rows[0].c;
  return after === before + 1;
});

await rejects("it refuses a conversation with yourself", () =>
  db.query(`select public.ensure_direct_channel('${ERIN}','${ERIN}')`),
  "two different people");

// It takes both members as arguments and asks nothing about who is calling, so
// a member reaching it could put themselves in a conversation with anyone.
await rejects("no signed-in member can reach it", () =>
  as(ERIN, () => db.query(`select public.ensure_direct_channel('${FRAN}','${BOB}')`)),
  "permission denied");

await check("open_direct_channel still works, and still checks who is asking", async () => {
  const id = (await as(FRAN, () => db.query(
    `select public.open_direct_channel('${ERIN}') id`))).rows[0].id;
  return typeof id === "string";
});

await rejects("a cancelled member still cannot open one", () =>
  as(DANA, () => db.query(`select public.open_direct_channel('${ERIN}')`)),
  "No portal access");

await check("build_check_in is a real job kind, ready to dispatch", async () => {
  const r = await db.query(
    `select count(*)::int c from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'due_job_kind' and e.enumlabel = 'build_check_in'`);
  return r.rows[0].c === 1;
});

await check("one check-in per build, ever — silence is not chased", async () => {
  // §2: non-response means the rate keeps accruing. The dedupe key is the build
  // itself, with no date in it, so a second planning pass adds nothing.
  await db.query(`
    insert into public.due_jobs (kind, member_id, due_on, dedupe_key, payload)
    values ('build_check_in','${ERIN}', current_date, 'build_check_in:${FOLLOW_UP}',
            jsonb_build_object('handover_pack_id','${FOLLOW_UP}'))`);
  try {
    await db.query(`
      insert into public.due_jobs (kind, member_id, due_on, dedupe_key, payload)
      values ('build_check_in','${ERIN}', current_date, 'build_check_in:${FOLLOW_UP}',
              jsonb_build_object('handover_pack_id','${FOLLOW_UP}'))`);
  } catch {
    // The unique dedupe key is the point.
  }
  const r = await db.query(
    `select count(*)::int c from public.due_jobs
     where dedupe_key = 'build_check_in:${FOLLOW_UP}'`);
  return r.rows[0].c === 1;
});

await check("a check-in response is readable by the coach, tagged to its build", async () => {
  const dm = (await db.query(
    `select public.ensure_direct_channel('${ERIN}','${ADMIN}') id`)).rows[0].id;
  await as(ERIN, () => db.query(`
    insert into public.chat_messages (channel_id, member_id, body, handover_pack_id)
    values ('${dm}','${ERIN}','Honestly it stopped running after week one','${FOLLOW_UP}')`));

  const nina = await as(ADMIN, () => db.query(
    `select body from public.chat_messages where handover_pack_id='${FOLLOW_UP}'
     and body like 'Honestly%'`));
  const outsider = await as(BOB, () => db.query(
    `select count(*)::int c from public.chat_messages where handover_pack_id='${FOLLOW_UP}'
     and body like 'Honestly%'`));

  // Nina sees it because she is in the conversation, not through special access.
  return nina.rows.length === 1 && outsider.rows[0].c === 0;
});

console.log("\n— member SOPs —");

await check("a member writes their own SOP and owns it", async () => {
  await as(ERIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source, sop, member_edited_at)
    values ('${ERIN}', 'Onboarding a new client', 'member_sop',
            '{"trigger":"They sign","steps":[{"text":"Create the record"}]}'::jsonb, now())`));
  const r = await as(ERIN, () => db.query(
    `select sop->>'trigger' t from public.handover_pack where title='Onboarding a new client'`));
  return r.rows[0].t === "They sign";
});

// The source is what a row IS. Structured steps on a hot seat write-up would
// mean it no longer says that.
// Tested as the admin: a member can't create a hot_seat entry at all, so RLS
// stops them before the constraint does. The constraint is what protects it from
// the one account that CAN write those rows.
// Retired 13 Sep 2026 with the L'Editoriale SOP flow. This used to assert that
// only a member_sop row could carry template content. Under the new flow the
// member writes the SOP *for a hot-seat build* into the same column on the
// hot_seat row, so the constraint was dropped and this test now asserts the
// opposite of what the product does. Kept as a comment rather than deleted,
// because a test that vanishes looks like it never existed, and the reason it
// stopped being true is the kind of thing the next person needs.
await check("a hot seat build can carry the member's own SOP (constraint retired)", async () => {
  const r = await as(ADMIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source, sop)
    values ('${ERIN}', 'A live build', 'hot_seat', '{"trigger":"x"}'::jsonb) returning id`));
  return Boolean(r.rows[0].id);
});

await check("a hot seat write-up needs no template content", async () => {
  await as(ADMIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source, body)
    values ('${ERIN}', 'Enquiry automation', 'hot_seat', 'What we built together.')`));
  const r = await as(ERIN, () => db.query(
    `select sop is null n from public.handover_pack where title='Enquiry automation'`));
  return r.rows[0].n === true;
});

await check("nobody else can read another member's SOPs", async () => {
  const theirs = await as(FRAN, () => db.query(
    `select count(*)::int c from public.handover_pack where member_id='${ERIN}'`));
  return theirs.rows[0].c === 0;
});

await rejects("nobody else can write into another member's Archivio", () =>
  as(FRAN, () => db.query(`
    insert into public.handover_pack (member_id, title, source)
    values ('${ERIN}', 'Not mine to add', 'member_sop')`)),
  "row-level security");

// Rule 6 protects the record of a membership — weekly logs, roadmap history,
// status. A first draft of a process somebody thought better of isn't that.
await check("a member can delete their own SOP", async () => {
  await as(ERIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source, sop)
    values ('${ERIN}', 'Abandoned draft', 'member_sop', '{}'::jsonb)`));
  await as(ERIN, () => db.query(
    `delete from public.handover_pack where title='Abandoned draft' and source='member_sop'`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.handover_pack where title='Abandoned draft'`));
  return r.rows[0].c === 0;
});

await check("a rejoined member keeps their old Archivio", async () => {
  // ALICE cancelled and rejoined earlier, so she sits in onboarding — the trap
  // the handover_pack policies were written to avoid, gating on portal access
  // rather than on active status.
  await as(ADMIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source, body)
    values ('${ALICE}', 'From before she left', 'hot_seat', 'Still hers.')`));
  const r = await as(ALICE, () => db.query(
    `select count(*)::int c from public.handover_pack where title='From before she left'`));
  return r.rows[0].c === 1;
});

console.log("\n— what a member may change about a write-up —");

const WRITE_UP = "17171717-1717-1717-1717-171717171717";
await as(ADMIN, () => db.query(`
  insert into public.handover_pack (id, member_id, title, source, body, drafted_by, confirmed_at)
  values ('${WRITE_UP}', '${ERIN}', 'Enquiry follow-up build', 'hot_seat',
          'What we built together, in Nina''s words.', 'nina', now())`));

// §8: the member can rephrase their own copy.
await check("a member can reword their own copy", async () => {
  await as(ERIN, () => db.query(`
    update public.handover_pack set body = 'In my own words.', member_edited_at = now()
    where id = '${WRITE_UP}'`));
  const r = await as(ERIN, () => db.query(
    `select body from public.handover_pack where id = '${WRITE_UP}'`));
  return r.rows[0].body === "In my own words.";
});

// The hole this closes: relabelling a build write-up as an SOP brings it under
// the delete policy, so one party could remove a shared record.
await rejects("a member cannot relabel a build write-up as their own SOP", () =>
  as(ERIN, () => db.query(
    `update public.handover_pack set source = 'member_sop' where id = '${WRITE_UP}'`)),
  "not yours to change");

await rejects("a member cannot sign off their own entry", () =>
  as(ERIN, () => db.query(
    `update public.handover_pack set confirmed_by = '${ERIN}' where id = '${WRITE_UP}'`)),
  "not yours to change");

await rejects("a member cannot claim somebody else drafted it", () =>
  as(ERIN, () => db.query(
    `update public.handover_pack set drafted_by = 'claude' where id = '${WRITE_UP}'`)),
  "not yours to change");

// §8: Nina names a build she wrote up.
await rejects("a member cannot rename a build write-up", () =>
  as(ERIN, () => db.query(
    `update public.handover_pack set title = 'My build' where id = '${WRITE_UP}'`)),
  "not yours to change");

await check("but they can rename their own SOP", async () => {
  await as(ERIN, () => db.query(`
    insert into public.handover_pack (id, member_id, title, source, sop)
    values ('18181818-1818-1818-1818-181818181818', '${ERIN}', 'First name', 'member_sop', '{}'::jsonb)`));
  await as(ERIN, () => db.query(`
    update public.handover_pack set title = 'Better name'
    where id = '18181818-1818-1818-1818-181818181818'`));
  const r = await as(ERIN, () => db.query(
    `select title from public.handover_pack where id = '18181818-1818-1818-1818-181818181818'`));
  return r.rows[0].title === "Better name";
});

await check("the write-up survives the relabel attempt intact", async () => {
  const r = await as(ADMIN, () => db.query(
    `select source, title, drafted_by from public.handover_pack where id = '${WRITE_UP}'`));
  return r.rows[0].source === "hot_seat"
    && r.rows[0].title === "Enquiry follow-up build"
    && r.rows[0].drafted_by === "nina";
});

await check("an admin can still write it up and sign it off", async () => {
  await as(ADMIN, () => db.query(`
    update public.handover_pack
    set body = 'Rewritten by Nina.', confirmed_at = now(), confirmed_by = '${ADMIN}'
    where id = '${WRITE_UP}'`));
  const r = await as(ADMIN, () => db.query(
    `select body from public.handover_pack where id = '${WRITE_UP}'`));
  return r.rows[0].body === "Rewritten by Nina.";
});

console.log("\n— roadmap action notes —");

const ROADMAP_ID = (await as(ADMIN, () => db.query(
  `select id from public.roadmap where member_id='${ALICE}' limit 1`))).rows[0].id;

await check("a member writes a note against an action", async () => {
  await as(ALICE, () => db.query(`
    insert into public.roadmap_action_notes (member_id, roadmap_id, action_id, body)
    values ('${ALICE}','${ROADMAP_ID}','0:0','Got stuck on the third step.')`));
  const r = await as(ALICE, () => db.query(
    `select body from public.roadmap_action_notes where action_id='0:0'`));
  return r.rows[0].body === "Got stuck on the third step.";
});

await check("Nina can read it — that's the point of it existing", async () => {
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.roadmap_action_notes where member_id='${ALICE}'`));
  return r.rows[0].c === 1;
});

await check("nobody else can", async () => {
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.roadmap_action_notes`));
  return r.rows[0].c === 0;
});

await check("one note per action, edited rather than appended to", async () => {
  try {
    await as(ALICE, () => db.query(`
      insert into public.roadmap_action_notes (member_id, roadmap_id, action_id, body)
      values ('${ALICE}','${ROADMAP_ID}','0:0','A second, contradictory note.')`));
  } catch {
    // The unique constraint is the point.
  }
  const r = await as(ALICE, () => db.query(
    `select count(*)::int c from public.roadmap_action_notes where action_id='0:0'`));
  return r.rows[0].c === 1;
});

await check("editing their own note works", async () => {
  await as(ALICE, () => db.query(`
    update public.roadmap_action_notes set body = 'Actually it is working now.'
    where action_id='0:0'`));
  const r = await as(ALICE, () => db.query(
    `select body from public.roadmap_action_notes where action_id='0:0'`));
  return r.rows[0].body === "Actually it is working now.";
});

// The column-ownership trap, checked on a new table before it bit rather than
// after: without the trigger a member could reattach what they said about one
// action to a different one.
await rejects("a note cannot be moved onto another action", () =>
  as(ALICE, () => db.query(
    `update public.roadmap_action_notes set action_id='0:1' where action_id='0:0'`)),
  "stays attached to the action");

await rejects("a note cannot be moved onto another roadmap", () =>
  as(ALICE, () => db.query(
    `update public.roadmap_action_notes set roadmap_id=gen_random_uuid() where action_id='0:0'`)),
  "stays attached to the action");

await check("a member can clear their own note", async () => {
  await as(ALICE, () => db.query(
    `delete from public.roadmap_action_notes where action_id='0:0'`));
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.roadmap_action_notes where action_id='0:0'`));
  return r.rows[0].c === 0;
});

await rejects("a member cannot write a note into somebody else's roadmap", () =>
  as(ERIN, () => db.query(`
    insert into public.roadmap_action_notes (member_id, roadmap_id, action_id, body)
    values ('${ALICE}','${ROADMAP_ID}','0:2','Not mine to write')`)),
  "row-level security");

console.log("\n— headshots —");

await check("a member's headshot path is stored on their listing", async () => {
  await as(ERIN, () => db.query(`
    update public.member_profiles set headshot_path = '${ERIN}/abc123.jpg'
    where member_id = '${ERIN}'`));
  const r = await as(ERIN, () => db.query(
    `select headshot_path from public.member_profiles where member_id='${ERIN}'`));
  return r.rows[0].headshot_path === `${ERIN}/abc123.jpg`;
});

await check("another member can see it — the directory is the point", async () => {
  const r = await as(FRAN, () => db.query(
    `select headshot_path from public.member_profiles where member_id='${ERIN}'`));
  return r.rows[0]?.headshot_path === `${ERIN}/abc123.jpg`;
});

await check("a member uploads into their own folder", async () => {
  await as(ERIN, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('headshots','${ERIN}/abc123.jpg')`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from storage.objects where name='${ERIN}/abc123.jpg'`));
  return r.rows[0].c === 1;
});

await rejects("and cannot upload into somebody else's", () =>
  as(FRAN, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('headshots','${ERIN}/forged.jpg')`)),
  "row-level security");

await check("a member replaces their own photo by removing the old one", async () => {
  await as(ERIN, () => db.query(
    `delete from storage.objects where bucket_id='headshots' and name='${ERIN}/abc123.jpg'`));
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from storage.objects where name='${ERIN}/abc123.jpg'`));
  return r.rows[0].c === 0;
});

await check("a member cannot delete somebody else's photo", async () => {
  await as(ADMIN, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('headshots','${FRAN}/mine.jpg')`));
  try {
    await as(ERIN, () => db.query(
      `delete from storage.objects where bucket_id='headshots' and name='${FRAN}/mine.jpg'`));
  } catch {
    // Either outcome is fine; what matters is the file surviving.
  }
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from storage.objects where name='${FRAN}/mine.jpg'`));
  return r.rows[0].c === 1;
});

console.log("\n— the reveal document —");

await check("an admin writes a member's reveal", async () => {
  await as(ADMIN, () => db.query(`
    insert into public.roadmap_reveals (member_id, in_their_words, priorities)
    values ('${ERIN}', 'I am drowning in admin.',
            '[{"title":"Rebuild follow-up","body":"It is all manual."}]'::jsonb)`));
  const r = await as(ADMIN, () => db.query(
    `select in_their_words from public.roadmap_reveals where member_id='${ERIN}'`));
  return r.rows[0].in_their_words === "I am drowning in admin.";
});

// §1: handed over before they log in, and La Strada is the live version
// afterwards. There is no member policy at all, rather than a restrictive one —
// a policy would imply there is a case where they should read it.
await check("the member it is about cannot read it", async () => {
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.roadmap_reveals`));
  return r.rows[0].c === 0;
});

await rejects("a member cannot write one either", () =>
  as(ERIN, () => db.query(`
    insert into public.roadmap_reveals (member_id, in_their_words)
    values ('${ERIN}', 'Writing my own')`)),
  "row-level security");

await check("one reveal per member — a second is the same moment rewritten", async () => {
  try {
    await as(ADMIN, () => db.query(`
      insert into public.roadmap_reveals (member_id, in_their_words)
      values ('${ERIN}', 'A different version')`));
  } catch {
    // The unique constraint is the point.
  }
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.roadmap_reveals where member_id='${ERIN}'`));
  return r.rows[0].c === 1;
});

// A snapshot: the roadmap moves on, this doesn't.
await check("editing the roadmap afterwards leaves the reveal alone", async () => {
  const before = await as(ADMIN, () => db.query(
    `select priorities from public.roadmap_reveals where member_id='${ERIN}'`));
  await as(ADMIN, () => db.query(`
    update public.roadmap set phases = '[]'::jsonb where member_id='${ERIN}'`));
  const after = await as(ADMIN, () => db.query(
    `select priorities from public.roadmap_reveals where member_id='${ERIN}'`));
  return JSON.stringify(after.rows[0].priorities) === JSON.stringify(before.rows[0].priorities);
});

console.log("\n— lesson completions —");

const LESSON = async (slug) => (await as(ADMIN, () => db.query(
  `select id from public.training_content where slug='${slug}'`))).rows[0].id;

await check("a member can mark a lesson they can see as complete", async () => {
  const id = await LESSON("looking-at-data");
  await as(ERIN, () => db.query(
    `insert into public.lesson_completions (member_id, content_id) values ('${ERIN}','${id}')`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.lesson_completions where content_id='${id}'`));
  return r.rows[0].c === 1;
});

await check("marking it again is a no-op, not a second row", async () => {
  const id = await LESSON("looking-at-data");
  await as(ERIN, () => db.query(
    `insert into public.lesson_completions (member_id, content_id) values ('${ERIN}','${id}')
     on conflict do nothing`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.lesson_completions where content_id='${id}'`));
  return r.rows[0].c === 1;
});

await rejects("a member cannot complete a lesson that is not visible to them", async () => {
  // The unpublished draft: training_content's RLS hides it, so the insert
  // policy's subquery finds nothing. No second copy of the tiering rules.
  const id = await LESSON("draft");
  return as(ERIN, () => db.query(
    `insert into public.lesson_completions (member_id, content_id) values ('${ERIN}','${id}')`));
}, "row-level security");

await rejects("a member cannot complete a lesson on somebody else's behalf", async () => {
  const id = await LESSON("looking-at-data");
  return as(ERIN, () => db.query(
    `insert into public.lesson_completions (member_id, content_id) values ('${BOB}','${id}')`));
}, "row-level security");

// BOB, who is active — not DANA, who is cancelled by this point in the file and
// would see nothing whatever the policy said. A mutation that dropped the owner
// check survived the first version of this test for exactly that reason.
await check("another member with access cannot see it", async () => {
  const r = await as(BOB, () => db.query(
    `select count(*)::int c from public.lesson_completions`));
  return r.rows[0].c === 0;
});

await check("a member cannot take somebody else's tick away", async () => {
  // RLS on delete matches nothing rather than throwing, so assert the row
  // survives rather than expecting an error.
  const id = await LESSON("looking-at-data");
  await as(BOB, () => db.query(
    `delete from public.lesson_completions where content_id='${id}'`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.lesson_completions where content_id='${id}'`));
  return r.rows[0].c === 1;
});

await check("a member can take their own tick back", async () => {
  const id = await LESSON("looking-at-data");
  await as(ERIN, () => db.query(
    `delete from public.lesson_completions where content_id='${id}'`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.lesson_completions where content_id='${id}'`));
  return r.rows[0].c === 0;
});

// A member who is actually cancelled. Not ALICE — she rejoins earlier in this
// file and ends it as onboarding, which is exactly the kind of fixture fact a
// test quietly assumes and gets wrong.
const GONE = "19191919-1919-1919-1919-191919191919";
await db.exec(`insert into auth.users (id, email) values ('${GONE}', 'gone@test')`);
await as(ADMIN, () => db.query(
  `select public.create_member('${GONE}','gone@test','Gone Member', now(), now())`));
await as(ADMIN, () => db.query(`select public.activate_member('${GONE}')`));
await as(ADMIN, () => db.query(`select public.cancel_member('${GONE}', 'left')`));

await rejects("a cancelled member cannot mark anything complete", async () => {
  const id = await LESSON("looking-at-data");
  return as(GONE, () => db.query(
    `insert into public.lesson_completions (member_id, content_id) values ('${GONE}','${id}')`));
}, "row-level security");

console.log("\n— hot-seat SOP flow (L'Editoriale) —");

await check("Nina can leave a comment on a build", async () => {
  await as(ADMIN, () => db.query(
    `update public.handover_pack set coach_note = 'Start with the trigger, not the tool.' where id='${WRITE_UP}'`));
  const r = await as(ERIN, () => db.query(
    `select coach_note from public.handover_pack where id='${WRITE_UP}'`));
  return r.rows[0].coach_note === "Start with the trigger, not the tool.";
});

await rejects("the member cannot change Nina's comment", () =>
  as(ERIN, () => db.query(
    `update public.handover_pack set coach_note = 'Actually...' where id='${WRITE_UP}'`)),
  "not yours to change");

await check("the member writes their own SOP on the build, and Nina's comment survives", async () => {
  await as(ERIN, () => db.query(
    `update public.handover_pack
       set sop = '{"trigger":"An enquiry lands","done":"They have a reply","owner":"Me","steps":[{"text":"Open the template"}],"tools":"Gmail","video":""}'::jsonb,
           member_edited_at = now()
     where id='${WRITE_UP}'`));
  const r = await as(ERIN, () => db.query(
    `select sop->>'owner' o, coach_note from public.handover_pack where id='${WRITE_UP}'`));
  return r.rows[0].o === "Me" && r.rows[0].coach_note === "Start with the trigger, not the tool.";
});

console.log("\n— archivio templates —");

await check("a member saves a template — a picture with a name", async () => {
  const r = await as(ERIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source, image_path)
    values ('${ERIN}', 'Pricing table', 'template', '${ERIN}/pricing.jpg') returning id`));
  return Boolean(r.rows[0].id);
});

await rejects("a template without a picture is refused", () =>
  as(ERIN, () => db.query(`
    insert into public.handover_pack (member_id, title, source)
    values ('${ERIN}', 'Nothing to see', 'template')`)),
  "handover_pack_template_has_image");

await check("a member can remove their own template", async () => {
  await as(ERIN, () => db.query(
    `delete from public.handover_pack where title='Pricing table' and member_id='${ERIN}'`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.handover_pack where title='Pricing table'`));
  return r.rows[0].c === 0;
});

await check("archivio images: own folder only", async () => {
  await as(ERIN, () => db.query(
    `insert into storage.objects (bucket_id, name) values ('archivio','${ERIN}/pricing.jpg')`));
  let intruded = false;
  try {
    await as(BOB, () => db.query(
      `insert into storage.objects (bucket_id, name) values ('archivio','${ERIN}/sneaky.jpg')`));
    intruded = true;
  } catch { /* refused, as it should be */ }
  const own = (await as(ERIN, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='archivio'`))).rows[0].c;
  const theirs = (await as(BOB, () => db.query(
    `select count(*)::int c from storage.objects where bucket_id='archivio'`))).rows[0].c;
  return !intruded && own === 1 && theirs === 0;
});

console.log("\n— onboarding steps —");

await check("a member ticks a step, and it's theirs alone to see", async () => {
  await as(ERIN, () => db.query(
    `insert into public.onboarding_steps (member_id, step) values ('${ERIN}','call')`));
  const own = (await as(ERIN, () => db.query(
    `select count(*)::int c from public.onboarding_steps`))).rows[0].c;
  const other = (await as(BOB, () => db.query(
    `select count(*)::int c from public.onboarding_steps`))).rows[0].c;
  return own === 1 && other === 0;
});

await rejects("only the six named steps exist", () =>
  as(ERIN, () => db.query(
    `insert into public.onboarding_steps (member_id, step) values ('${ERIN}','seventh')`)),
  "onboarding_steps_step_check");

await rejects("a member cannot tick a step for somebody else", () =>
  as(BOB, () => db.query(
    `insert into public.onboarding_steps (member_id, step) values ('${ERIN}','video')`)),
  "row-level security");

await check("a tick survives the member becoming active — nothing here reads status", async () => {
  // ERIN is already active. The point is structural: no policy or column
  // references members.status, so there is nothing for a flip to change.
  const r = await as(ERIN, () => db.query(
    `select step from public.onboarding_steps where member_id='${ERIN}'`));
  return r.rows[0].step === "call";
});

console.log("\n— notification preferences —");

await check("a member can turn their own reminders off", async () => {
  await as(ERIN, () => db.query(
    `update public.members set notify_reminders = false where id='${ERIN}'`));
  const r = await as(ERIN, () => db.query(
    `select notify_reminders, notify_chat from public.members where id='${ERIN}'`));
  return r.rows[0].notify_reminders === false && r.rows[0].notify_chat === true;
});

await check("and not somebody else's", async () => {
  try {
    await as(BOB, () => db.query(
      `update public.members set notify_chat = false where id='${ERIN}'`));
  } catch { /* refused or matched nothing; either way it must not change */ }
  const r = await as(ERIN, () => db.query(
    `select notify_chat from public.members where id='${ERIN}'`));
  return r.rows[0].notify_chat === true;
});

console.log("\n— message reactions —");

// A message in #general (everyone with access can see it) and one in a direct
// channel between ERIN and FRAN (BOB cannot). Both from ERIN.
const GENERAL_MSG = async () => {
  const general = await generalId();
  return (await as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${general}','${ERIN}','react to this') returning id`))).rows[0].id;
};
const DIRECT_MSG = async () => {
  const ch = (await as(ERIN, () => db.query(
    `select public.open_direct_channel('${FRAN}') id`))).rows[0].id;
  return (await as(ERIN, () => db.query(
    `insert into public.chat_messages (channel_id, member_id, body)
     values ('${ch}','${ERIN}','just us') returning id`))).rows[0].id;
};
const generalMsg = await GENERAL_MSG();
const directMsg = await DIRECT_MSG();

await check("a member can react to a message they can see", async () => {
  await as(BOB, () => db.query(
    `insert into public.message_reactions (message_id, member_id, emoji) values ('${generalMsg}','${BOB}','👏')`));
  const r = await as(ERIN, () => db.query(
    `select count(*)::int c from public.message_reactions where message_id='${generalMsg}'`));
  return r.rows[0].c === 1;
});

await rejects("only the four fixed emoji are accepted", () =>
  as(BOB, () => db.query(
    `insert into public.message_reactions (message_id, member_id, emoji) values ('${generalMsg}','${BOB}','🔥')`)),
  "message_reactions_emoji_check");

await rejects("a member cannot react to a message in a channel they are not in", () =>
  as(BOB, () => db.query(
    `insert into public.message_reactions (message_id, member_id, emoji) values ('${directMsg}','${BOB}','❤️')`)),
  "row-level security");

await rejects("a member cannot react as somebody else", () =>
  as(BOB, () => db.query(
    `insert into public.message_reactions (message_id, member_id, emoji) values ('${generalMsg}','${ERIN}','❤️')`)),
  "row-level security");

await check("reactions in a direct channel are invisible to outsiders", async () => {
  await as(FRAN, () => db.query(
    `insert into public.message_reactions (message_id, member_id, emoji) values ('${directMsg}','${FRAN}','🤩')`));
  const outsider = await as(BOB, () => db.query(
    `select count(*)::int c from public.message_reactions where message_id='${directMsg}'`));
  const insider = await as(ERIN, () => db.query(
    `select count(*)::int c from public.message_reactions where message_id='${directMsg}'`));
  return outsider.rows[0].c === 0 && insider.rows[0].c === 1;
});

await check("a member can take their own reaction back, and nobody else's", async () => {
  await as(ERIN, () => db.query(
    `delete from public.message_reactions where message_id='${generalMsg}' and emoji='👏'`));
  const stillThere = (await as(BOB, () => db.query(
    `select count(*)::int c from public.message_reactions where message_id='${generalMsg}'`))).rows[0].c;
  await as(BOB, () => db.query(
    `delete from public.message_reactions where message_id='${generalMsg}' and emoji='👏'`));
  const gone = (await as(BOB, () => db.query(
    `select count(*)::int c from public.message_reactions where message_id='${generalMsg}'`))).rows[0].c;
  return stillThere === 1 && gone === 0;
});

console.log("\n— chat round 2: pins, images, search, retraction —");

const PIN_MSG = await GENERAL_MSG();

await check("an admin pins a message; everyone who can see it sees the pin", async () => {
  await as(ADMIN, () => db.query(
    `insert into public.chat_pins (message_id, pinned_by) values ('${PIN_MSG}','${ADMIN}')`));
  const r = await as(BOB, () => db.query(
    `select count(*)::int c from public.chat_pins where message_id='${PIN_MSG}'`));
  return r.rows[0].c === 1;
});

await rejects("a member cannot pin", () =>
  as(BOB, () => db.query(
    `insert into public.chat_pins (message_id, pinned_by) values ('${PIN_MSG}','${BOB}')`)),
  "row-level security");

await rejects("a message is pinned at most once", () =>
  as(ADMIN, () => db.query(
    `insert into public.chat_pins (message_id, pinned_by) values ('${PIN_MSG}','${ADMIN}')`)),
  "chat_pins_pkey");

await check("a member cannot unpin", async () => {
  await as(BOB, () => db.query(`delete from public.chat_pins where message_id='${PIN_MSG}'`));
  const r = await as(ADMIN, () => db.query(
    `select count(*)::int c from public.chat_pins where message_id='${PIN_MSG}'`));
  return r.rows[0].c === 1;
});

await check("deleting a pinned message removes its pin and its reactions", async () => {
  await as(BOB, () => db.query(
    `insert into public.message_reactions (message_id, member_id, emoji) values ('${PIN_MSG}','${BOB}','🙌')`));
  // ERIN wrote it; ERIN retracts it.
  await as(ERIN, () => db.query(`delete from public.chat_messages where id='${PIN_MSG}'`));
  const pins = (await as(ADMIN, () => db.query(
    `select count(*)::int c from public.chat_pins where message_id='${PIN_MSG}'`))).rows[0].c;
  const reactions = (await as(ADMIN, () => db.query(
    `select count(*)::int c from public.message_reactions where message_id='${PIN_MSG}'`))).rows[0].c;
  const msg = (await as(ADMIN, () => db.query(
    `select count(*)::int c from public.chat_messages where id='${PIN_MSG}'`))).rows[0].c;
  return pins === 0 && reactions === 0 && msg === 0;
});

await check("a member cannot delete somebody else's message; an admin can", async () => {
  const theirs = await GENERAL_MSG(); // ERIN's
  await as(BOB, () => db.query(`delete from public.chat_messages where id='${theirs}'`));
  const still = (await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_messages where id='${theirs}'`))).rows[0].c;
  await as(ADMIN, () => db.query(`delete from public.chat_messages where id='${theirs}'`));
  const gone = (await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_messages where id='${theirs}'`))).rows[0].c;
  return still === 1 && gone === 0;
});

await check("an image message: own folder only, and a picture alone is content", async () => {
  const general = await generalId();
  await as(ERIN, () => db.query(`
    insert into public.chat_messages (channel_id, member_id, image_path)
    values ('${general}','${ERIN}','${ERIN}/photo.jpg')`));
  let forged = false;
  try {
    await as(ERIN, () => db.query(`
      insert into public.chat_messages (channel_id, member_id, image_path)
      values ('${general}','${ERIN}','${BOB}/theirs.jpg')`));
    forged = true;
  } catch (e) {
    if (!String(e.message).includes("chat_messages_image_is_own")) throw e;
  }
  return !forged;
});

await check("search finds a message by a word in it, only in channels you can see", async () => {
  const general = await generalId();
  await as(ERIN, () => db.query(`
    insert into public.chat_messages (channel_id, member_id, body)
    values ('${general}','${ERIN}','The pricing spreadsheet is ready')`));
  const direct = await DIRECT_MSG(); // ERIN + FRAN, body 'just us'
  await as(ERIN, () => db.query(
    `update public.chat_messages set body = 'private spreadsheet thoughts' where id='${direct}'`)).catch(() => {});
  const bob = await as(BOB, () => db.query(
    `select count(*)::int c from public.chat_messages
     where search_vector @@ websearch_to_tsquery('english','spreadsheet')`));
  const erin = await as(ERIN, () => db.query(
    `select count(*)::int c from public.chat_messages
     where search_vector @@ websearch_to_tsquery('english','spreadsheet')`));
  // BOB sees the general one; ERIN would also see the direct one if the
  // update had been allowed, but there is no update policy, so both see 1.
  return bob.rows[0].c === 1 && erin.rows[0].c === 1;
});

await check("the coach is identifiable by id, and only by id", async () => {
  const r = await as(BOB, () => db.query(`select public.coach_member_ids() id`));
  return Array.isArray(r.rows);
});


console.log("\n— push subscriptions —");

await check("a member registers a device, and only they can see it", async () => {
  await as(ERIN, () => db.query(`
    insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
    values ('${ERIN}','https://push.example/erin-phone','k1','a1')`));
  const own = (await as(ERIN, () => db.query(`select count(*)::int c from public.push_subscriptions`))).rows[0].c;
  const other = (await as(BOB, () => db.query(`select count(*)::int c from public.push_subscriptions`))).rows[0].c;
  return own === 1 && other === 0;
});

await rejects("a device cannot be registered under somebody else's name", () =>
  as(BOB, () => db.query(`
    insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
    values ('${ERIN}','https://push.example/bob-pretending','k','a')`)),
  "row-level security");

await rejects("an endpoint is one row, whoever sends it", () =>
  as(ERIN, () => db.query(`
    insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
    values ('${ERIN}','https://push.example/erin-phone','k2','a2')`)),
  "push_subscriptions_endpoint_key");

await check("push switches default to messages on, reactions off", async () => {
  const r = await as(ERIN, () => db.query(
    `select push_chat, push_reactions from public.members where id='${ERIN}'`));
  return r.rows[0].push_chat === true && r.rows[0].push_reactions === false;
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
