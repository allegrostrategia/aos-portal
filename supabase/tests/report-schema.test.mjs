/**
 * Reporting tool — schema and RLS tests. Part of `npm run test:db`.
 *
 * Brief: docs/reporting/reporting-tool-brief.md §13, which asks for security
 * in both RLS and code, never RLS alone, and for draft reports and
 * unpublished notes to be unreadable to the client AT DATABASE LEVEL. That is
 * what this file checks: every assertion runs as a real signed-in user with
 * their own JWT claim, over the policies as written.
 *
 * Its own file rather than more of schema.test.mjs, which is already 125KB.
 */
import { createTestDatabase, asMember } from "./pglite.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const db = await createTestDatabase();

const NINA = "11111111-0000-0000-0000-000000000001";   // admin, has a members row
const ELIZE = "11111111-0000-0000-0000-000000000002";  // team, NO members row
const RETAINER = "11111111-0000-0000-0000-000000000003"; // retainer client, NO members row
const MEMBER = "11111111-0000-0000-0000-000000000004";  // aOS member, real members row
const CHIARA = "11111111-0000-0000-0000-000000000005";  // Chiarezza, NO members row
const RIVAL = "11111111-0000-0000-0000-000000000006";   // a second retainer client
const MEMBER2 = "11111111-0000-0000-0000-000000000007"; // a second aOS member, for chat

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}', 'nina@allegro.test'),
    ('${ELIZE}', 'elize@allegro.test'),
    ('${RETAINER}', 'client@retainer.test'),
    ('${MEMBER}', 'member@aos.test'),
    ('${CHIARA}', 'chiara@chiarezza.test'),
    ('${RIVAL}', 'rival@retainer.test'),
    ('${MEMBER2}', 'member2@aos.test');

  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}', 'nina@allegro.test', 'Nina Oliver', 'admin', 'active'),
    ('${MEMBER}', 'member@aos.test', 'Marco', 'member', 'active'),
    ('${MEMBER2}', 'member2@aos.test', 'Giulia', 'member', 'active');
`);

let pass = 0, fail = 0;
const as = (uid, fn) => asMember(db, uid, fn);
const one = async (uid, sql) => (await as(uid, () => db.query(sql))).rows[0];
const count = async (uid, sql) => (await one(uid, sql)).c;

async function check(name, fn) {
  try {
    const r = await fn();
    if (r === true) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} — got ${JSON.stringify(r)}`); }
  } catch (e) { fail++; console.log(`  FAIL ${name} — threw: ${e.message}`); }
}

async function rejects(name, fn, expect) {
  try { await fn(); fail++; console.log(`  FAIL ${name} — expected rejection, none thrown`); }
  catch (e) {
    if (!expect || e.message.includes(expect)) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} — wrong error: ${e.message}`); }
  }
}

// ---------------------------------------------------------------------------
console.log("\n— the metric seed —");
// ---------------------------------------------------------------------------

await check("the seed migration matches what the generator produces", async () => {
  // The seed is generated from the brief's own tables. If someone hand-edits
  // the migration, the spec and the database disagree and nothing else here
  // would notice.
  await promisify(execFile)("node", ["scripts/generate-report-metrics-seed.mjs", "--check"]);
  return true;
});

await check("every category in the enum except overview has metrics", async () => {
  const r = await db.query(`
    select e.enumlabel as category, count(m.key)::int as n
    from unnest(enum_range(null::public.report_category)) e(enumlabel)
    left join public.report_metrics m on m.category = e.enumlabel
    group by 1 order by 1`);
  const empty = r.rows.filter((x) => x.n === 0).map((x) => x.category);
  // 5.1: "Overview (report only, no inputs)" — its KPIs are other categories'
  // metrics, so it is the one category that correctly has none of its own.
  return empty.length === 1 && empty[0] === "overview";
});

await check("no calc metric is missing its formula", async () =>
  (await db.query(
    `select count(*)::int c from public.report_metrics where input_type = 'calc' and formula is null`
  )).rows[0].c === 0);

// The count is deliberate: it notices a metric added or lost by accident.
// 174 at the Stage 1 seed; 175 from 5 Oct (§5.8's opening figure, which
// exists because "active clients at start" is pulled and so can never be
// typed); 176 from 6 Oct (§5.5's captured funnel price, so a price rise
// cannot rewrite a month the client has read).
await check("anyone signed in reads the metric list", async () =>
  (await count(RETAINER, `select count(*)::int c from public.report_metrics`)) === 176);

await rejects("a client cannot add a metric", () =>
  as(MEMBER, () => db.query(`
    insert into public.report_metrics (key, category, label, input_type, unit, good_direction, sort_order)
    values ('x_y', 'email', 'X', 'core', 'count', 'up', 999)`)),
  "row-level security");

// ---------------------------------------------------------------------------
console.log("\n— creating workspaces and granting access —");
// ---------------------------------------------------------------------------

await rejects("a non-admin cannot create a workspace", () =>
  as(ELIZE, () => db.query(
    `select public.create_report_workspace('${RETAINER}', 'retainer', 'Bella Ltd', 'Bella', '2026-01-01')`)),
  "Only an admin");

const WS_R = (await one(NINA, `
  select (public.create_report_workspace(
    '${RETAINER}', 'retainer', 'Bella Ltd', 'Bella Rossi', '2026-01-01')).id as id`)).id;

const WS_M = (await one(NINA, `
  select (public.create_report_workspace(
    '${MEMBER}', 'aos_member', 'Marco Studio', 'Marco', '2026-01-01')).id as id`)).id;

const WS_C = (await one(NINA, `
  select (public.create_report_workspace(
    '${CHIARA}', 'chiarezza', 'Chiara Co', 'Chiara', '2026-01-01', 'GBP', '2026-12-01')).id as id`)).id;

const WS_RIVAL = (await one(NINA, `
  select (public.create_report_workspace(
    '${RIVAL}', 'retainer', 'Rival Ltd', 'Rival', '2026-01-01')).id as id`)).id;

await check("creating a workspace grants its client in the same call", async () =>
  (await count(NINA,
    `select count(*)::int c from public.report_access
     where workspace_id = '${WS_R}' and user_id = '${RETAINER}' and role = 'client'`)) === 1);

await rejects("a non-admin cannot assign a team member", () =>
  as(ELIZE, () => db.query(
    `select public.assign_report_team_member('${WS_R}', '${ELIZE}', 'Elize')`)),
  "Only an admin");

await check("Nina assigns Elize to one client", async () => {
  await one(NINA, `select public.assign_report_team_member('${WS_R}', '${ELIZE}', 'Elize Barbieri')`);
  return (await count(ELIZE,
    `select count(*)::int c from public.report_access where user_id = '${ELIZE}'`)) === 1;
});

await rejects("assigning over the client's own grant is refused", () =>
  as(NINA, () => db.query(
    `select public.assign_report_team_member('${WS_R}', '${RETAINER}', 'Bella')`)),
  "is the client on this workspace");

await check("a second workspace for the same client is allowed", async () => {
  // Nina, 30 Sep: nobody knows yet whether a retainer client runs two
  // businesses. Workspace and client are separate concepts here, so this
  // needs no migration if it turns out somebody does.
  const id = (await one(NINA, `
    select (public.create_report_workspace(
      '${RETAINER}', 'retainer', 'Bella Second Ltd', 'Bella Rossi', '2026-01-01')).id as id`)).id;
  return typeof id === "string" && id !== WS_R;
});

// ---------------------------------------------------------------------------
console.log("\n— reporting identity isolation (CLAUDE.md rule 7 / brief §2) —");
//
// The whole reason retainer clients, Chiarezza attendees and Elize have no
// `members` row. has_portal_access() is `status <> 'cancelled'`, and three
// shared surfaces read it with no ownership check — so a members row created
// for convenience would put a paying client inside Piazza Sociale.
//
// Each surface is seeded with real rows first: "sees zero" proves nothing
// against an empty table.
// ---------------------------------------------------------------------------

await db.exec(`
  insert into public.chat_channels (id, kind, slug, name)
    values ('22222222-0000-0000-0000-000000000001', 'group', 'la-piazza', 'La Piazza');
  insert into public.chat_messages (channel_id, member_id, body)
    values ('22222222-0000-0000-0000-000000000001', '${MEMBER2}', 'Private to members');
  insert into public.member_profiles (member_id, display_name, completed_at)
    values ('${MEMBER2}', 'Giulia', now());
  insert into public.draws (draw_month, prize, draw_date)
    values ('2026-09-01', 'A weekend in Positano', '2026-09-28');
  insert into public.hot_seat_sessions (session_month) values ('2026-09-01');
`);

await check("an aOS member really can see those shared surfaces", async () =>
  (await count(MEMBER, `select count(*)::int c from public.chat_messages`)) === 1
  && (await count(MEMBER, `select count(*)::int c from public.member_profiles`)) === 1
  && (await count(MEMBER, `select count(*)::int c from public.draws`)) === 1
  && (await count(MEMBER, `select count(*)::int c from public.hot_seat_sessions`)) === 1);

for (const [who, uid] of [["Elize", ELIZE], ["a retainer client", RETAINER], ["a Chiarezza attendee", CHIARA]]) {
  await check(`${who} sees nothing in the members' portal`, async () => {
    const seen = {
      chat_channels: await count(uid, `select count(*)::int c from public.chat_channels`),
      chat_messages: await count(uid, `select count(*)::int c from public.chat_messages`),
      member_profiles: await count(uid, `select count(*)::int c from public.member_profiles`),
      draws: await count(uid, `select count(*)::int c from public.draws`),
      hot_seat_sessions: await count(uid, `select count(*)::int c from public.hot_seat_sessions`),
      members: await count(uid, `select count(*)::int c from public.members`),
    };
    const leaked = Object.entries(seen).filter(([, n]) => n !== 0);
    return leaked.length === 0 ? true : `leaked ${JSON.stringify(Object.fromEntries(leaked))}`;
  });

  await check(`${who} is neither an admin nor a portal member`, async () =>
    (await one(uid, `select public.is_portal_admin() a, public.has_portal_access() p`)).a === false
    && (await one(uid, `select public.is_portal_admin() a, public.has_portal_access() p`)).p === false);
}

// ---------------------------------------------------------------------------
console.log("\n— who can see which workspace —");
// ---------------------------------------------------------------------------

await check("a client sees only their own workspaces", async () =>
  (await count(RETAINER, `select count(*)::int c from public.report_workspaces`)) === 2);

await check("one retainer client cannot see another's workspace", async () =>
  (await count(RETAINER,
    `select count(*)::int c from public.report_workspaces where id = '${WS_RIVAL}'`)) === 0);

await check("Elize sees only the workspace she is assigned to", async () =>
  (await count(ELIZE, `select count(*)::int c from public.report_workspaces`)) === 1);

await check("Nina sees every workspace", async () =>
  (await count(NINA, `select count(*)::int c from public.report_workspaces`)) === 5);

await check("report_can_edit: a retainer client cannot, their team can", async () =>
  (await one(RETAINER, `select public.report_can_edit('${WS_R}') e`)).e === false
  && (await one(ELIZE, `select public.report_can_edit('${WS_R}') e`)).e === true);

await check("report_can_edit: a self-serve client enters their own", async () =>
  (await one(MEMBER, `select public.report_can_edit('${WS_M}') e`)).e === true
  && (await one(CHIARA, `select public.report_can_edit('${WS_C}') e`)).e === true);

// ---------------------------------------------------------------------------
console.log("\n— entering figures, and reading back a draft —");
// ---------------------------------------------------------------------------

const MONTH = "2026-09-01";

await rejects("a retainer client cannot enter their own figures", () =>
  as(RETAINER, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'email_new_subscribers', 182, '${RETAINER}')`)),
  "row-level security");

await check("Elize enters a figure for the client she is assigned to", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'email_new_subscribers', 182, '${ELIZE}')`));
  return true;
});

await check("Elize reads back the number she just entered, before publish", async () =>
  // The bug in the first draft of this schema: insert and update policies but
  // no select path to an unpublished month, so the entry screen would save a
  // figure and redisplay an empty box.
  (await one(ELIZE,
    `select value::int v from public.report_values where workspace_id = '${WS_R}'`)).v === 182);

await check("the retainer client cannot read it while the month is a draft", async () =>
  (await count(RETAINER,
    `select count(*)::int c from public.report_values where workspace_id = '${WS_R}'`)) === 0);

await check("a self-serve member reads their own figures with no publish at all", async () => {
  await as(MEMBER, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_M}', '${MONTH}', 'email_new_subscribers', 64, '${MEMBER}')`));
  return (await count(MEMBER,
    `select count(*)::int c from public.report_values where workspace_id = '${WS_M}'`)) === 1;
});

await rejects("the same month-level figure cannot be stored twice", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'email_new_subscribers', 200, '${ELIZE}')`)),
  "report_values_one_per_cell");

await rejects("a calculated metric cannot be stored", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'email_unsubscribe_rate', 0.4, '${ELIZE}')`)),
  "worked out rather than stored");

await rejects("a pulled metric cannot be stored either", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'leads_conversions_new_leads_from_ads', 12, '${ELIZE}')`)),
  "worked out rather than stored");

// ---------------------------------------------------------------------------
console.log("\n— entities —");
// ---------------------------------------------------------------------------

const OFFER = (await one(ELIZE, `
  insert into public.report_entities (workspace_id, entity_type, name, price, pricing_model, hourly_cost)
  values ('${WS_R}', 'offer', '1:1 Coaching Package', 2500, 'one_off', 75) returning id`)).id;

await check("a funnel links to an offer in the same workspace", async () => {
  const id = (await one(ELIZE, `
    insert into public.report_entities (workspace_id, entity_type, name, linked_offer_id)
    values ('${WS_R}', 'funnel', 'Lead magnet', '${OFFER}') returning id`)).id;
  return typeof id === "string";
});

await rejects("a funnel cannot link to an offer in another workspace", async () => {
  const other = (await one(NINA, `
    insert into public.report_entities (workspace_id, entity_type, name, price, pricing_model)
    values ('${WS_RIVAL}', 'offer', 'Rival offer', 100, 'one_off') returning id`)).id;
  return as(ELIZE, () => db.query(`
    insert into public.report_entities (workspace_id, entity_type, name, linked_offer_id)
    values ('${WS_R}', 'funnel', 'Crossed wires', '${other}')`));
}, "same workspace");

await rejects("a funnel cannot link to something that is not an offer", () =>
  as(ELIZE, () => db.query(`
    with f as (
      insert into public.report_entities (workspace_id, entity_type, name)
      values ('${WS_R}', 'funnel', 'First funnel') returning id
    )
    insert into public.report_entities (workspace_id, entity_type, name, linked_offer_id)
    select '${WS_R}', 'funnel', 'Second funnel', id from f`)),
  "only be linked to an offer");

await rejects("a non-offer cannot carry offer setup", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_entities (workspace_id, entity_type, name, hourly_cost)
    values ('${WS_R}', 'funnel', 'Priced funnel', 50)`)),
  "report_entities_offer_fields");

await check("a per-offer figure is stored against its offer", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, entity_id, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'offers_revenue_this_month', '${OFFER}', 10000, '${ELIZE}')`));
  return (await one(ELIZE,
    `select value::int v from public.report_values where entity_id = '${OFFER}'`)).v === 10000;
});

await rejects("a figure cannot be broken down by the wrong kind of thing", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, entity_id, value, entered_by)
    values ('${WS_R}', '${MONTH}', 'email_emails_sent', '${OFFER}', 12, '${ELIZE}')`)),
  "cannot be broken down by");

// ---------------------------------------------------------------------------
console.log("\n— publishing is Nina's alone (her decision, 30 Sep 2026) —");
// ---------------------------------------------------------------------------

await check("Elize opens the month as a draft", async () => {
  await as(ELIZE, () => db.query(
    `insert into public.report_periods (workspace_id, month) values ('${WS_R}', '${MONTH}')`));
  return true;
});

await rejects("Elize cannot publish by updating the period", () =>
  as(ELIZE, () => db.query(`
    update public.report_periods set published_at = now(), published_by = '${ELIZE}'
    where workspace_id = '${WS_R}' and month = '${MONTH}'`)),
  "Only an admin can publish");

await rejects("Elize cannot publish by inserting an already-published period", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_periods (workspace_id, month, published_at, published_by)
    values ('${WS_R}', '2026-08-01', now(), '${ELIZE}')`)),
  "Only an admin can publish");

await check("Nina publishes, and the client can then read the month", async () => {
  await as(NINA, () => db.query(`
    update public.report_periods set published_at = now(), published_by = '${NINA}'
    where workspace_id = '${WS_R}' and month = '${MONTH}'`));
  return (await count(RETAINER,
    `select count(*)::int c from public.report_values
     where workspace_id = '${WS_R}' and month = '${MONTH}'`)) === 2;
});

await check("publishing one month does not reveal another", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values ('${WS_R}', '2026-10-01', 'email_new_subscribers', 210, '${ELIZE}')`));
  return (await count(RETAINER,
    `select count(*)::int c from public.report_values
     where workspace_id = '${WS_R}' and month = '2026-10-01'`)) === 0;
});

// ---------------------------------------------------------------------------
console.log("\n— notes: §13's 'unreadable at database level' —");
// ---------------------------------------------------------------------------

await check("Elize writes a strategist note on a draft month", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_notes (workspace_id, month, note_type, author_id, author_name, body)
    values ('${WS_R}', '2026-10-01', 'strategist', '${ELIZE}', 'Elize Barbieri',
            'Draft: new clients dipped, recommend relaunching the ad campaign.')`));
  return true;
});

await check("a retainer client reads zero strategist notes on an unpublished month", async () =>
  (await count(RETAINER, `
    select count(*)::int c from public.report_notes
    where workspace_id = '${WS_R}' and month = '2026-10-01' and note_type = 'strategist'`)) === 0);

await check("Elize reads back her own draft note", async () =>
  (await count(ELIZE, `
    select count(*)::int c from public.report_notes
    where workspace_id = '${WS_R}' and month = '2026-10-01'`)) === 1);

await check("Elize reads a colleague's draft note on an unpublished month", async () => {
  // Her own notes she can always read, because she wrote them. This is the
  // other half: a note Nina drafted, on a month nobody has published, which
  // Elize needs on screen to work from — and which reaches her through the
  // month gate rather than through authorship.
  await as(NINA, () => db.query(`
    insert into public.report_notes (workspace_id, month, category, note_type, author_id, author_name, body)
    values ('${WS_R}', '2026-10-01', 'ads', 'strategist', '${NINA}', 'Nina Oliver',
            'Draft: pause the awareness campaign.')`));
  return (await count(ELIZE, `
    select count(*)::int c from public.report_notes
    where month = '2026-10-01' and author_id = '${NINA}'`)) === 1;
});

await check("once the month is published the client reads the note", async () => {
  await as(NINA, () => db.query(`
    insert into public.report_periods (workspace_id, month, published_at, published_by)
    values ('${WS_R}', '2026-10-01', now(), '${NINA}')`));
  // Both of them: Elize's and Nina's. Publishing a month releases the whole
  // month's commentary, not whichever note happens to be first.
  return (await count(RETAINER, `
    select count(*)::int c from public.report_notes
    where workspace_id = '${WS_R}' and month = '2026-10-01' and note_type = 'strategist'`)) === 2;
});

await check("a retainer client can reply, and always reads their own reply", async () => {
  await as(RETAINER, () => db.query(`
    insert into public.report_notes (workspace_id, month, note_type, author_id, author_name, body)
    values ('${WS_R}', '2026-10-01', 'client_reply', '${RETAINER}', 'Bella Rossi',
            'Agreed — let us relaunch in week 2.')`));
  return (await count(RETAINER, `
    select count(*)::int c from public.report_notes
    where note_type = 'client_reply'`)) === 1;
});

await rejects("a retainer client cannot write a strategist note", () =>
  as(RETAINER, () => db.query(`
    insert into public.report_notes (workspace_id, month, note_type, author_id, author_name, body)
    values ('${WS_R}', '2026-10-01', 'strategist', '${RETAINER}', 'Bella', 'I am my own strategist')`)),
  "row-level security");

await rejects("a self-serve member cannot write a strategist note about themselves", () =>
  as(MEMBER, () => db.query(`
    insert into public.report_notes (workspace_id, month, note_type, author_id, author_name, body)
    values ('${WS_M}', '${MONTH}', 'strategist', '${MEMBER}', 'Marco', 'Notes from my strategist')`)),
  "row-level security");

await check("a member writes their own reflection", async () => {
  await as(MEMBER, () => db.query(`
    insert into public.report_notes (workspace_id, month, note_type, author_id, author_name, body)
    values ('${WS_M}', '${MONTH}', 'reflection', '${MEMBER}', 'Marco', 'Quiet month, good margins.')`));
  return (await count(MEMBER, `select count(*)::int c from public.report_notes`)) === 1;
});

await check("an author can revise their own wording", async () => {
  await as(MEMBER, () => db.query(`
    update public.report_notes set body = 'Quiet month, excellent margins.'
    where workspace_id = '${WS_M}'`));
  return (await one(MEMBER,
    `select body from public.report_notes where workspace_id = '${WS_M}'`)).body
    === "Quiet month, excellent margins.";
});

await rejects("an author cannot change what kind of note it is", () =>
  as(MEMBER, () => db.query(
    `update public.report_notes set note_type = 'strategist' where workspace_id = '${WS_M}'`)),
  "what it is and who wrote it cannot");

await rejects("a fourth objective for one month is refused", () =>
  as(MEMBER, () => db.query(`
    insert into public.report_notes (workspace_id, month, note_type, author_id, author_name, body, position)
    values
      ('${WS_M}', '${MONTH}', 'objective', '${MEMBER}', 'Marco', 'One', 1),
      ('${WS_M}', '${MONTH}', 'objective', '${MEMBER}', 'Marco', 'Two', 2),
      ('${WS_M}', '${MONTH}', 'objective', '${MEMBER}', 'Marco', 'Three', 3),
      ('${WS_M}', '${MONTH}', 'objective', '${MEMBER}', 'Marco', 'Four', 4)`)),
  "report_notes_position_range");

// ---------------------------------------------------------------------------
console.log("\n— targets and benchmarks —");
// ---------------------------------------------------------------------------

await check("Allegro sets a retainer client's targets (§7)", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_targets (workspace_id, metric_key, target_value)
    values ('${WS_R}', 'email_new_subscribers', 250)`));
  await as(ELIZE, () => db.query(`
    insert into public.report_targets (workspace_id, metric_key, month, target_value)
    values ('${WS_R}', 'email_new_subscribers', '2026-11-01', 300)`));
  return true;
});

await check("a standing target is visible to the client straight away", async () =>
  (await count(RETAINER,
    `select count(*)::int c from public.report_targets where month is null`)) === 1);

await check("a target for an unpublished month is not", async () =>
  (await count(RETAINER,
    `select count(*)::int c from public.report_targets where month = '2026-11-01'`)) === 0);

await rejects("a retainer client cannot set their own target", () =>
  as(RETAINER, () => db.query(`
    insert into public.report_targets (workspace_id, metric_key, target_value)
    values ('${WS_R}', 'email_emails_sent', 40)`)),
  "row-level security");

await check("an aOS member sets their own targets (§7)", async () => {
  await as(MEMBER, () => db.query(`
    insert into public.report_targets (workspace_id, metric_key, target_value)
    values ('${WS_M}', 'email_new_subscribers', 100)`));
  return (await count(MEMBER, `select count(*)::int c from public.report_targets`)) === 1;
});

await rejects("two standing targets for the same metric collide", () =>
  as(MEMBER, () => db.query(`
    insert into public.report_targets (workspace_id, metric_key, target_value)
    values ('${WS_M}', 'email_new_subscribers', 120)`)),
  "report_targets_one_per_cell");

// ---------------------------------------------------------------------------
console.log("\n— the admin-only columns, and the service role —");
// ---------------------------------------------------------------------------

await rejects("an editor cannot change a workspace's kind", () =>
  as(ELIZE, () => db.query(
    `update public.report_workspaces set kind = 'aos_member' where id = '${WS_R}'`)),
  "Only an admin can change");

await rejects("an editor cannot move a workspace to another owner", () =>
  as(ELIZE, () => db.query(
    `update public.report_workspaces set owner_user_id = '${ELIZE}' where id = '${WS_R}'`)),
  "Only an admin can change");

await rejects("a Chiarezza attendee cannot extend their own access", () =>
  as(CHIARA, () => db.query(
    `update public.report_workspaces set access_end_date = '2027-12-01' where id = '${WS_C}'`)),
  "Only an admin can change");

await check("an editor can still set the things that are theirs", async () => {
  await as(MEMBER, () => db.query(`
    update public.report_workspaces
    set hidden_categories = '{trial_reels,ads}', benchmark_country = 'United Kingdom'
    where id = '${WS_M}'`));
  const r = await one(MEMBER,
    `select array_length(hidden_categories, 1) n, benchmark_country c from public.report_workspaces where id = '${WS_M}'`);
  return r.n === 2 && r.c === "United Kingdom";
});

await check("the service role — no uid at all — can run the Chiarezza expiry sweep", async () => {
  // The guard admits `auth.uid() is null` for exactly this. A guard admitting
  // only is_portal_admin() refuses the cron, which is how the day-7 pairing
  // flag went unset in production for three weeks.
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.query(
    `update public.report_workspaces set access_end_date = '2026-09-29' where id = '${WS_C}'`);
  const r = await db.query(
    `select access_end_date::text d from public.report_workspaces where id = '${WS_C}'`);
  return r.rows[0].d === "2026-09-29";
});

await check("an expired Chiarezza login reaches nothing", async () => {
  // Expiry is a database fact, not a screen that stops rendering (§13 asks
  // for both). access_end_date is now in the past.
  const ws = await count(CHIARA, `select count(*)::int c from public.report_workspaces`);
  const canView = (await one(CHIARA, `select public.report_can_view('${WS_C}') v`)).v;
  return ws === 0 && canView === false;
});

await check("their data is kept, not deleted (§2)", async () =>
  (await count(NINA, `select count(*)::int c from public.report_workspaces where id = '${WS_C}'`)) === 1);

// ---------------------------------------------------------------------------
console.log("\n— cancellation (CLAUDE.md rule 7) —");
// ---------------------------------------------------------------------------

await check("a cancelled aOS member loses their reporting access too", async () => {
  // For a member, reporting is one more area of the membership, so it goes
  // when the membership does. Found while writing the routing resolver: this
  // is the one place report_can_view() has to consult has_portal_access(),
  // and it would otherwise have let a cancelled member keep reading.
  const before = await count(MEMBER, `select count(*)::int c from public.report_values`);
  await as(NINA, () => db.query(
    `update public.members set status = 'cancelled' where id = '${MEMBER}'`));
  const after = await count(MEMBER, `select count(*)::int c from public.report_values`);
  const canView = (await one(MEMBER, `select public.report_can_view('${WS_M}') v`)).v;
  return before === 1 && after === 0 && canView === false;
});

await check("their figures are kept, and Nina still reads them", async () =>
  (await count(NINA,
    `select count(*)::int c from public.report_values where workspace_id = '${WS_M}'`)) === 1);

await check("rejoining restores it, same row", async () => {
  await as(NINA, () => db.query(
    `update public.members set status = 'onboarding' where id = '${MEMBER}'`));
  return (await count(MEMBER, `select count(*)::int c from public.report_values`)) === 1;
});

await check("a retainer client has no membership to lose", async () =>
  // No members row at all, so has_portal_access() is false for them always.
  // If the new clause were not scoped to kind, this would be zero.
  (await count(RETAINER, `select count(*)::int c from public.report_workspaces`)) === 2);

await check("Elize's assignment is not a membership either", async () =>
  (await count(ELIZE, `select count(*)::int c from public.report_workspaces`)) === 1);

// ---------------------------------------------------------------------------
console.log("\n— launches —");
// ---------------------------------------------------------------------------

const LAUNCH = (await one(ELIZE, `
  insert into public.report_launches (workspace_id, name, offer_entity_id, status, goal_good, goal_better, goal_best)
  values ('${WS_R}', 'Signature Course', '${OFFER}', 'live', 10, 20, 30) returning id`)).id;

await rejects("goals have to ascend", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_launches (workspace_id, name, goal_good, goal_better)
    values ('${WS_R}', 'Backwards', 30, 10)`)),
  "report_launches_goals_ascend");

await check("the retainer client cannot see an unpublished launch", async () =>
  (await count(RETAINER, `select count(*)::int c from public.report_launches`)) === 0);

await rejects("Elize cannot publish a launch either", () =>
  as(ELIZE, () => db.query(
    `update public.report_launches set published_at = now(), published_by = '${ELIZE}' where id = '${LAUNCH}'`)),
  "Only an admin can publish");

await check("once Nina publishes it, the client sees it and its stages", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_launch_stages (launch_id, position, stage_type, name, is_main_selling_stage)
    values ('${LAUNCH}', 1, 'challenge', 'Challenge', true)`));
  await as(NINA, () => db.query(
    `update public.report_launches set published_at = now(), published_by = '${NINA}' where id = '${LAUNCH}'`));
  return (await count(RETAINER, `select count(*)::int c from public.report_launches`)) === 1
    && (await count(RETAINER, `select count(*)::int c from public.report_launch_stages`)) === 1;
});

await rejects("only one stage can be the main selling stage", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_launch_stages (launch_id, position, stage_type, name, is_main_selling_stage)
    values ('${LAUNCH}', 2, 'masterclass', 'Masterclass', true)`)),
  "report_launch_stages_one_main");

await rejects("a non-launch metric cannot be stored as a launch figure", () =>
  as(ELIZE, () => db.query(`
    insert into public.report_launch_values (launch_id, metric_key, value)
    values ('${LAUNCH}', 'email_emails_sent', 12)`)),
  "not a launch metric");

await rejects("a launch figure cannot point at another launch's stage", async () => {
  const other = (await one(ELIZE, `
    insert into public.report_launches (workspace_id, name) values ('${WS_R}', 'Other') returning id`)).id;
  const stage = (await one(ELIZE, `
    insert into public.report_launch_stages (launch_id, position, stage_type, name)
    values ('${other}', 1, 'webinar', 'Webinar') returning id`)).id;
  return as(ELIZE, () => db.query(`
    insert into public.report_launch_values (launch_id, stage_id, metric_key, value)
    values ('${LAUNCH}', '${stage}', 'launches_sign_ups', 250)`));
}, "belongs to a different launch");

// ---------------------------------------------------------------------------
console.log("\n— CSV audit and reminders —");
// ---------------------------------------------------------------------------

await check("an editor records what an import filled", async () => {
  await as(ELIZE, () => db.query(`
    insert into public.report_csv_imports (workspace_id, file_name, platform, month, uploaded_by, fields_filled)
    values ('${WS_R}', 'meta-content-sep.csv', 'meta_content', '${MONTH}', '${ELIZE}',
            '{social_media_views,social_media_saves}')`));
  return (await count(ELIZE, `select count(*)::int c from public.report_csv_imports`)) === 1;
});

await check("an editor cannot delete or rewrite the record of an import", async () => {
  // Note the shape of the refusal: with no DELETE or UPDATE policy, Postgres
  // matches no rows rather than raising. The statement succeeds and changes
  // nothing, which is why this is asserted on the row afterwards and not on
  // an exception — an "it threw" test here would have passed for the wrong
  // reason, or rather, would have failed while the behaviour was correct.
  await as(ELIZE, () => db.query(
    `delete from public.report_csv_imports where workspace_id = '${WS_R}'`));
  await as(ELIZE, () => db.query(
    `update public.report_csv_imports set file_name = 'something-else.csv'
     where workspace_id = '${WS_R}'`));

  const rows = await as(ELIZE, () => db.query(
    `select file_name from public.report_csv_imports where workspace_id = '${WS_R}'`));
  return rows.rows.length === 1 && rows.rows[0].file_name === "meta-content-sep.csv";
});

await check("the reminder log is not readable by a client", async () => {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.query(
    `insert into public.report_reminders (workspace_id, month, reminder) values ('${WS_M}', '${MONTH}', 1)`);
  return (await count(MEMBER, `select count(*)::int c from public.report_reminders`)) === 0
    && (await count(NINA, `select count(*)::int c from public.report_reminders`)) === 1;
});

await rejects("the same reminder cannot be logged twice", async () => {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  return db.query(
    `insert into public.report_reminders (workspace_id, month, reminder) values ('${WS_M}', '${MONTH}', 1)`);
}, "report_reminders_workspace_id_month_reminder_key");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
