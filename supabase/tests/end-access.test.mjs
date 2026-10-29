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

const { endReportClientAccess } = await import("../../src/lib/admin/report-users.ts");
const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");
const { getReportUser } = await import("../../src/lib/auth/report.ts");

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
