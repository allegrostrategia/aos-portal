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
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);
const db = await new PGlite();

await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create role authenticated;
  grant usage on schema public to authenticated;
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

for (const f of (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(path.join(MIGRATIONS, f), "utf8"));
}
// Supabase grants these automatically via default privileges; mirror that here.
await db.exec(`
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
`);

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
async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
