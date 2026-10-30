/**
 * Ending a retainer client's access, through the app's own action.
 *
 * The database half is in `report-schema.test.mjs` — who may call the
 * function, which kinds it refuses, and that every figure survives. This file
 * is the half above it: the two presses, who is refused before the function is
 * ever reached, and the two downstream reads that would otherwise keep
 * treating an ended client as a current one.
 *
 * That last part is where the real risk is. Revoking is only half a feature if
 * the publish email still finds the recipient, or if their own session still
 * lists the workspace in a picker whose every figure then refuses to load.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { sent, reset } from "./stubs/email-send.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { endReportClientAccess, restoreReportClientAccess } = await import(
  "../../src/lib/admin/report-users.ts",
);
const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");
const { getReportUser } = await import("../../src/lib/auth/report.ts");
const { reportAccessEnded } = await import("../../src/lib/reporting/access-ended.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const AUG = "2026-08-01";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'),
    ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let workspace;
await asMember(db, NINA, async () => {
  const { rows } = await db.query(`
    select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Bella Ltd', 'Bella Rossi', '${AUG}')).id as id`);
  workspace = rows[0].id;
  await db.query(
    `insert into public.report_periods (workspace_id, month) values
       ('${workspace}', '${AUG}'), ('${workspace}', '${SEP}')`,
  );
});

const as = (uid) => configure(db, uid);

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** The whole form the screen submits, minus the confirm step. */
const endForm = (extra = {}) =>
  form({
    workspace_id: workspace,
    user_id: CLIENT,
    business_name: "Bella Ltd",
    contact_name: "Bella Rossi",
    ...extra,
  });

const grant = async () =>
  (await asMember(db, NINA, () =>
    db.query(
      `select revoked_at, revoked_by::text as by from public.report_access
        where workspace_id = '${workspace}' and user_id = '${CLIENT}'`,
    ),
  )).rows[0];

// A Server Action is a public endpoint, so the action re-checks rather than
// trusting the screen that rendered the button. Same shape as the password
// actions: requireAdmin() redirects, and a redirect from a Server Action is
// thrown.
test("a team member cannot reach it at all", async () => {
  as(ELIZE);
  await assert.rejects(() => endReportClientAccess(null, endForm()), /REDIRECT:/);
  assert.equal((await grant()).revoked_at, null);
});

test("the client cannot end their own access", async () => {
  as(CLIENT);
  await assert.rejects(() => endReportClientAccess(null, endForm()), /REDIRECT:/);
  assert.equal((await grant()).revoked_at, null);
});

test("the first press asks, and changes nothing", async () => {
  as(NINA);
  const state = await endReportClientAccess(null, endForm());

  assert.equal(state?.needsConfirm, true);
  assert.match(state?.error ?? "", /Bella Rossi/);
  assert.match(state?.error ?? "", /Bella Ltd/);
  assert.match(state?.error ?? "", /no undo/);
  assert.equal(
    (await grant()).revoked_at,
    null,
    "the first press must not revoke anything",
  );
});

test("a form with no client named is refused before anything else", async () => {
  as(NINA);
  const state = await endReportClientAccess(null, form({ confirm: "1" }));
  assert.match(state?.error ?? "", /No client given/);
});

test("the second press ends it, and records who", async () => {
  as(NINA);
  const state = await endReportClientAccess(null, endForm({ confirm: "1" }));

  assert.equal(state?.needsConfirm, undefined);
  assert.match(state?.notice ?? "", /Access ended/);
  assert.match(state?.notice ?? "", /still here/);

  const row = await grant();
  assert.ok(row.revoked_at, "revoked_at should be set");
  assert.equal(row.by, NINA);
});

test("a second attempt says it has already happened", async () => {
  as(NINA);
  const state = await endReportClientAccess(null, endForm({ confirm: "1" }));
  assert.match(state?.error ?? "", /already ended/);
});

// The grant row stays, and `report_access_select_own` still returns it to
// them because it is their own row. So without the filter in getReportUser an
// ended client would open on a picker listing Bella Ltd, and every figure
// behind it would then refuse to load.
test("and /no-access says their access ENDED, with the date", async () => {
  // The sentence a retainer client reads. It is not the Chiarezza one — that
  // window "ran until" a date set when they were invited, this one ended on a
  // day Nina chose — and the only thing standing between the two is `reason`.
  as(CLIENT);
  const ended = await reportAccessEnded();

  assert.equal(ended?.reason, "revoked");
  assert.equal(ended?.endedOn, new Date().toISOString().slice(0, 10));
});

test("their own session no longer sees the workspace", async () => {
  as(CLIENT);
  const user = await getReportUser();
  assert.equal(user, null, "no grants and not an admin, so no reporting user at all");
});

test("Nina still has every month of it", async () => {
  as(NINA);
  const user = await getReportUser();
  assert.equal(user?.isAdmin, true);

  const months = await asMember(db, NINA, () =>
    db.query(
      `select count(*)::int c from public.report_periods where workspace_id = '${workspace}'`,
    ),
  );
  assert.equal(months.rows[0].c, 2);
});

// The failure this guards: publishing after ending access would have emailed
// the person whose access was just revoked, with a link they can no longer
// open. The contact is found by looking for a `client` grant, and the ended
// one is still a client grant.
test("publishing a month emails nobody now", async () => {
  reset();
  as(NINA);
  const state = await publishMonth(null, form({ workspace_id: workspace, month: AUG }));
  await flushAfter();

  assert.equal(state?.error, undefined, `publish itself should still work: ${state?.error}`);
  assert.deepEqual(
    sent().map((m) => m.to),
    [],
    "an ended client is not a recipient",
  );
});

test("the month really did publish — it is the email that stopped", async () => {
  const row = await asMember(db, NINA, () =>
    db.query(
      `select published_at, email_error from public.report_periods
        where workspace_id = '${workspace}' and month = '${AUG}'`,
    ),
  );
  assert.ok(row.rows[0].published_at, "published");
  assert.match(
    row.rows[0].email_error ?? "",
    /nobody to email/,
    "and it says why nothing went out, rather than looking like a success",
  );
});

// --- giving it back ---------------------------------------------------------
//
// The half that makes ending it safe to do. Same two presses, same action
// shape; what matters here is that everything the ending switched off comes
// back on, because each of those was a separate filter that had to be right
// in both directions.

test("a team member cannot restore it either", async () => {
  as(ELIZE);
  await assert.rejects(() => restoreReportClientAccess(null, endForm()), /REDIRECT:/);
  assert.ok((await grant()).revoked_at, "still ended");
});

test("the first press asks, and changes nothing", async () => {
  as(NINA);
  const state = await restoreReportClientAccess(null, endForm());

  assert.equal(state?.needsConfirm, true);
  assert.match(state?.error ?? "", /Bella Rossi/);
  assert.match(state?.error ?? "", /Bella Ltd/);
  assert.match(state?.error ?? "", /emailed again/);
  assert.ok((await grant()).revoked_at, "the first press must not restore anything");
});

test("the second press restores it, on the same grant row", async () => {
  as(NINA);
  const state = await restoreReportClientAccess(null, endForm({ confirm: "1" }));

  assert.equal(state?.needsConfirm, undefined);
  assert.match(state?.notice ?? "", /Access restored/);

  const row = await grant();
  assert.equal(row.revoked_at, null);
  assert.equal(row.by, null);
});

test("their own session finds the workspace again", async () => {
  as(CLIENT);
  const user = await getReportUser();
  assert.equal(user?.isAdmin, false);
  assert.equal(user?.grants.length, 1, "the grant they had, not a second empty one");
  assert.equal(user?.grants[0].business_name, "Bella Ltd");
});

test("and publishing a month emails them again", async () => {
  reset();
  as(NINA);
  // September, because August was published while their access was ended.
  const state = await publishMonth(null, form({ workspace_id: workspace, month: SEP }));
  await flushAfter();

  assert.equal(state?.error, undefined, `publish should work: ${state?.error}`);
  assert.deepEqual(sent().map((m) => m.to), ["bella@client.test"]);
});

test("every month they had is still theirs, including the one sent to nobody", async () => {
  // The whole argument for restoring the row rather than re-inviting: August
  // was published while they were gone and is waiting for them.
  const months = await asMember(db, NINA, () =>
    db.query(
      `select count(*)::int c from public.report_periods
        where workspace_id = '${workspace}' and published_at is not null`,
    ),
  );
  assert.equal(months.rows[0].c, 2);
});


// --- the other way a reporting login stops ----------------------------------

test("a Chiarezza window that ran out says 'ran until', not 'ended on'", async () => {
  const CHIARA = "44444444-4444-4444-4444-444444444444";
  await db.exec(`insert into auth.users (id, email) values ('${CHIARA}','chiara@course.test')`);

  await asMember(db, NINA, () =>
    db.query(`
      select public.create_report_workspace(
        '${CHIARA}', 'chiarezza', 'Chiara Co', 'Chiara', '${AUG}', 'GBP', '2026-09-30')`),
  );

  as(CHIARA);
  const ended = await reportAccessEnded();

  assert.equal(ended?.reason, "expired", "a window running out is not a revoking");
  assert.equal(ended?.endedOn, "2026-09-30", "the date it was always going to end");
});
