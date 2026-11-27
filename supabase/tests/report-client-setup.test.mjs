/**
 * A reporting client, set up before they are invited (Nina, 27 November).
 *
 * Her rule is about timing and nothing else: the invitation is the first
 * thing a client ever receives from aOS, and it used to be sent by the
 * same press that created the workspace — so "set them up, enter two
 * months, then let them in" was not a sequence the product could perform.
 *
 * What is worth testing is therefore mostly what does NOT happen on the
 * first step: no login, no grant, no email. And on the second, the two
 * things that would be silent if they were wrong — the account kind that
 * decides which wording the invitation email uses, and the rollback when
 * the grant fails after the login has been made.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { authCalls, resetAuthCalls } from "./supabase-shim.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { setUpReportClient, sendReportClientInvitation, assignReportTeamMember } =
  await import("../../src/lib/admin/report-users.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const MEMBER = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'),
    ('${ELIZE}','elize@allegro.test'),
    ('${MEMBER}','ruth@member.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active'),
    ('${MEMBER}','ruth@member.test','Ruth Member','member','active');
`);

const as = (uid) => configure(db, uid);
const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const setUpForm = (extra = {}) =>
  form({
    business_name: "Bella Ltd",
    display_name: "Bella Rossi",
    email: "bella@client.test",
    kind: "retainer",
    first_month: "2026-08",
    ...extra,
  });

const workspaceNamed = async (name) =>
  (await rows(`select id::text, owner_user_id::text as owner,
                      pending_client_name as pname, pending_client_email as pemail
                 from public.report_workspaces where business_name = '${name}'`))[0];

// **Not through `asMember`.** `auth.users` belongs to GoTrue and the
// `authenticated` role cannot read it — which is the whole reason a
// client's address has to be fetched with the service role. Counting it
// as a member gets "permission denied for schema auth", not a count.
const users = async () =>
  (await db.query(`select count(*)::int c from auth.users`)).rows[0].c;

let WORKSPACE;

// ---------------------------------------------------------------------------
// Step one — and what it must not do
// ---------------------------------------------------------------------------

test("a team member cannot set a client up", async () => {
  as(ELIZE);
  await assert.rejects(() => setUpReportClient(null, setUpForm()), /REDIRECT:/);
});

test("a member cannot either", async () => {
  as(MEMBER);
  await assert.rejects(() => setUpReportClient(null, setUpForm()), /REDIRECT:/);
});

test("Nina sets one up, and nothing is sent", async () => {
  as(NINA);
  resetAuthCalls();
  const before = await users();

  const state = await setUpReportClient(null, setUpForm());

  assert.match(state?.notice ?? "", /set up and ready for figures/);
  assert.match(state?.notice ?? "", /has not been\s+invited yet/);
  assert.equal(await users(), before, "no login was created");
  assert.deepEqual(authCalls(), [], "and the auth API was not called at all");

  const workspace = await workspaceNamed("Bella Ltd");
  WORKSPACE = workspace.id;
  assert.equal(workspace.owner, null, "nobody owns it yet");
  assert.equal(workspace.pname, "Bella Rossi");
  assert.equal(workspace.pemail, "bella@client.test");

  const grants = await rows(
    `select count(*)::int c from public.report_access where workspace_id = '${WORKSPACE}'`,
  );
  assert.equal(grants[0].c, 0, "and nobody can reach it but an admin");
});

test("the team can enter figures against it straight away", async () => {
  // Which is the whole point of the split: a workspace nobody has been
  // invited to is still a workspace Elize works in.
  await asMember(db, NINA, () =>
    db.query(`select public.assign_report_team_member('${WORKSPACE}', '${ELIZE}', 'Elize')`),
  );
  await asMember(db, ELIZE, async () => {
    await db.query(`insert into public.report_periods (workspace_id, month)
                    values ('${WORKSPACE}', '2026-08-01')`);
    await db.query(`insert into public.report_values (workspace_id, month, metric_key, value)
                    values ('${WORKSPACE}', '2026-08-01', 'financials_cash_in_bank_at_month_end', 12000)`);
  });
  const figures = await rows(
    `select count(*)::int c from public.report_values where workspace_id = '${WORKSPACE}'`,
  );
  assert.equal(figures[0].c, 1);
});

test("an aOS member is refused, by the database as well as the form", async () => {
  as(NINA);
  const viaForm = await setUpReportClient(null, setUpForm({ kind: "aos_member" }));
  assert.match(viaForm?.error ?? "", /already has a login/i);

  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`select public.set_up_report_client(
        'aos_member', 'Ruth Test', 'Ruth', 'ruth@member.test', '2026-08-01')`),
      /comes with their member record/i,
    );
  });
});

test("an address that is not one is refused where it is typed", async () => {
  as(NINA);
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`select public.set_up_report_client(
        'retainer', 'Nope Ltd', 'Nope', 'not-an-address', '2026-08-01')`),
      /pending_email_shape/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Step two — the login, and the wording it arrives in
// ---------------------------------------------------------------------------

test("the first press asks, names the address, and sends nothing", async () => {
  as(NINA);
  resetAuthCalls();
  const state = await sendReportClientInvitation(
    null,
    form({ workspace_id: WORKSPACE }),
  );

  assert.equal(state?.needsConfirm, true);
  assert.match(state?.error ?? "", /Bella Rossi at bella@client\.test/);
  assert.match(state?.error ?? "", /Nothing is published yet/);
  assert.match(state?.error ?? "", /being prepared/);
  assert.deepEqual(authCalls(), [], "nothing was sent");
  assert.equal((await workspaceNamed("Bella Ltd")).owner, null);
});

test("and says what is waiting for them when a month is published", async () => {
  as(NINA);
  await asMember(db, NINA, () =>
    db.query(`update public.report_periods set published_at = now(), published_by = '${NINA}'
               where workspace_id = '${WORKSPACE}'`),
  );
  const state = await sendReportClientInvitation(null, form({ workspace_id: WORKSPACE }));
  assert.match(state?.error ?? "", /One month is published/);
});

test("the second press makes the login, and tells the email which wording to use", async () => {
  as(NINA);
  resetAuthCalls();

  const state = await sendReportClientInvitation(
    null,
    form({ workspace_id: WORKSPACE, confirm: "1" }),
  );
  assert.match(state?.notice ?? "", /Invitation sent to bella@client\.test/);

  const invite = authCalls().find((c) => c.kind === "invite");
  assert.ok(invite, "an invitation went");
  assert.equal(invite.email, "bella@client.test");
  // **The reason this test exists.** One Supabase template serves every
  // invitation aOS sends, and this is the only thing in it that knows a
  // retainer client from a member — without it they are told their aOS
  // login is ready and that everything they are going to come to love
  // lives there.
  assert.deepEqual(invite.data, { account_kind: "retainer" });

  const workspace = await workspaceNamed("Bella Ltd");
  assert.ok(workspace.owner, "the workspace has an owner now");
  assert.equal(workspace.pname, null, "and the pending contact is gone");
  assert.equal(workspace.pemail, null);

  const grant = (await rows(`select role, display_name, revoked_at
                               from public.report_access
                              where workspace_id = '${WORKSPACE}'
                                and user_id = '${workspace.owner}'`))[0];
  assert.deepEqual(
    { role: grant.role, name: grant.display_name, revoked: grant.revoked_at },
    { role: "client", name: "Bella Rossi", revoked: null },
    "the name typed at set-up is the name on the grant",
  );
});

test("a second send is refused, and sends nothing", async () => {
  as(NINA);
  resetAuthCalls();
  const state = await sendReportClientInvitation(
    null,
    form({ workspace_id: WORKSPACE, confirm: "1" }),
  );
  assert.match(state?.error ?? "", /already has a client login/);
  assert.deepEqual(authCalls(), [], "no second login was made");
});

test("the database refuses it too, not only the action", async () => {
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`select public.invite_report_client_login(
        '${WORKSPACE}', '${ELIZE}')`),
      /already has a login/i,
    );
  });
});

test("an invited client cannot be given a pending address again", async () => {
  // The settings form writes these two columns, and before the invitation
  // that is how a mistyped address is fixed. After it, the contact's name
  // is on their grant and their address is on their login — a pending
  // copy would be a second answer to "where do we email this client",
  // invisible on every screen because every screen reads the grant.
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`update public.report_workspaces
                         set pending_client_name = 'Someone Else',
                             pending_client_email = 'someone@else.test'
                       where id = '${WORKSPACE}'`),
      /pending_only_before_the_login/i,
    );
  });
});

test("and a workspace can never have neither an owner nor a contact", async () => {
  // What replaced `owner_user_id not null`: the same promise one step
  // earlier. Without it, a bug that forgot the contact would leave a
  // workspace that reads as "Not invited yet" for ever with no address to
  // invite.
  await asMember(db, NINA, async () => {
    await assert.rejects(
      () => db.query(`insert into public.report_workspaces
          (kind, business_name, first_month) values ('retainer', 'Nobody Ltd', '2026-08-01')`),
      /has_a_client/i,
    );
  });
});

test("a Chiarezza attendee gets the Chiarezza wording", async () => {
  as(NINA);
  resetAuthCalls();
  await setUpReportClient(
    null,
    setUpForm({
      business_name: "Chiara Coaching",
      display_name: "Chiara",
      email: "chiara@client.test",
      kind: "chiarezza",
      access_end_date: "2026-12",
    }),
  );
  const workspace = await workspaceNamed("Chiara Coaching");
  await sendReportClientInvitation(
    null,
    form({ workspace_id: workspace.id, confirm: "1" }),
  );

  const invite = authCalls().find((c) => c.kind === "invite");
  assert.deepEqual(invite.data, { account_kind: "chiarezza" });
});

test("a team member's own invitation says she works here", async () => {
  as(NINA);
  resetAuthCalls();
  const workspace = await workspaceNamed("Chiara Coaching");
  const state = await assignReportTeamMember(
    null,
    form({
      workspace_id: workspace.id,
      email: "newhire@allegro.test",
      display_name: "A New Hire",
    }),
  );
  assert.match(state?.notice ?? "", /can now work on this client/);

  const invite = authCalls().find((c) => c.kind === "invite");
  assert.deepEqual(
    invite.data,
    { account_kind: "team" },
    "she is not a member and not a client, and the template has a branch for that",
  );
});

test("an invitation whose grant fails takes its login back with it", async () => {
  // The stranded-login case, which is the worst outcome available here: an
  // auth user with no workspace can set a password, reach nothing, and
  // cannot be invited again because the address is taken.
  as(NINA);
  resetAuthCalls();
  await setUpReportClient(
    null,
    setUpForm({
      business_name: "Rollback Ltd",
      display_name: "Rolla",
      email: "rolla@client.test",
    }),
  );
  const workspace = await workspaceNamed("Rollback Ltd");

  // **The grant is made to fail, because every reachable cause of it
  // happens between two statements this test cannot interleave** — the
  // real one is a second press arriving while the first is between its
  // invitation and its grant, which the row lock turns into a refusal.
  // What is being tested is the action's half: whatever the function
  // says no to, the login it has just created must not survive it.
  //
  // Put back from the migration itself rather than retyped, so this
  // cannot leave a different function behind than the one the rest of
  // the suite ran against.
  const migration = readFileSync(
    "supabase/migrations/20261127100000_a_client_before_their_login.sql",
    "utf8",
  );
  const from = migration.indexOf(
    "create or replace function public.invite_report_client_login(",
  );
  const real = migration.slice(from, migration.indexOf("\n$$;", from) + 4);
  assert.match(real, /already has a login/, "sliced the right function out");

  await db.exec(`create or replace function public.invite_report_client_login(
      p_workspace_id uuid, p_user_id uuid)
    returns public.report_access language plpgsql security definer set search_path = ''
    as $$ begin raise exception 'the grant failed'; end; $$;`);

  let state;
  try {
    state = await sendReportClientInvitation(
      null,
      form({ workspace_id: workspace.id, confirm: "1" }),
    );
  } finally {
    await db.exec(real);
  }

  assert.match(state?.error ?? "", /rolled back/i);
  assert.match(state?.error ?? "", /the grant failed/);
  const deleted = authCalls().find((c) => c.kind === "delete_user");
  assert.ok(deleted, "the login it had just made was deleted");
  const left = await db.query(
    `select count(*)::int c from auth.users where email = 'rolla@client.test'`,
  );
  assert.equal(left.rows[0].c, 0, "so the address can be invited again");
});

test("an address that already has an account is said out loud", async () => {
  as(NINA);
  await setUpReportClient(
    null,
    setUpForm({
      business_name: "Second Ltd",
      display_name: "Bella Again",
      email: "bella@client.test",
    }),
  );
  const workspace = await workspaceNamed("Second Ltd");
  const state = await sendReportClientInvitation(
    null,
    form({ workspace_id: workspace.id, confirm: "1" }),
  );
  assert.match(state?.error ?? "", /already has an account/);
  assert.equal((await workspaceNamed("Second Ltd")).owner, null, "and it stays uninvited");
});
