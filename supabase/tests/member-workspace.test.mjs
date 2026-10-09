/**
 * A member's reporting workspace arrives with the member (decision 30).
 *
 * Driven as the real people against the real rules: Nina creating a
 * member, the same call running again on a rejoin, an admin who should
 * get nothing, and the service role, which has no JWT at all.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "44444444-4444-4444-4444-444444444444";
const SECOND_ADMIN = "55555555-5555-5555-5555-555555555555";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'),
    ('${RUTH}','ruth@member.test'),
    ('${SECOND_ADMIN}','dom@allegro.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;
const workspacesFor = async (id) =>
  (await rows(`select id, business_name, kind::text, first_month::text
                 from public.report_workspaces
                where owner_user_id = '${id}' and kind = 'aos_member'`));

test("creating a member creates their report in the same breath", async () => {
  await asMember(db, NINA, () =>
    db.query(`select public.create_member(
      '${RUTH}', 'ruth@member.test', 'Ruth Fairweather',
      now(), now(), 6::smallint, '2026-08-14'::date)`));

  const found = await workspacesFor(RUTH);
  assert.equal(found.length, 1, "exactly one, and it exists without anybody making it");
  // No business name on `members`, so it starts as the person and
  // /reporting/settings is where they correct it.
  assert.equal(found[0].business_name, "Ruth Fairweather");
  // The month they joined, so their first report is their first month.
  assert.equal(found[0].first_month, "2026-08-01");

  // And they can actually reach it: the grant is theirs, as the client.
  const grants = await rows(`select role::text, display_name from public.report_access
                              where workspace_id = '${found[0].id}'`);
  assert.deepEqual(grants, [{ role: "client", display_name: "Ruth Fairweather" }]);
});

test("a rejoin reuses the row, and does not error", async () => {
  // Rule 7: rejoining is the SAME member row going through onboarding
  // again, so this runs a second time for somebody who already has a
  // workspace. Erroring would block the rejoin; making a second would
  // split their history in two.
  const before = await workspacesFor(RUTH);

  await asMember(db, NINA, () =>
    db.query(`select public.cancel_member('${RUTH}')`));
  await asMember(db, NINA, () =>
    db.query(`update public.members set status = 'onboarding' where id = '${RUTH}'`));

  const returned = await asMember(db, NINA, () =>
    db.query(`select (public.ensure_member_report_workspace('${RUTH}')).id as id`));

  const after = await workspacesFor(RUTH);
  assert.equal(after.length, 1, "still one");
  assert.equal(after[0].id, before[0].id, "and the same one");
  assert.equal(returned.rows[0].id, before[0].id, "which is what it hands back");
});

test("and running it a third time is still fine", async () => {
  for (let i = 0; i < 3; i += 1) {
    await asMember(db, NINA, () =>
      db.query(`select public.ensure_member_report_workspace('${RUTH}')`));
  }
  assert.equal((await workspacesFor(RUTH)).length, 1);
});

test("an admin gets none — she is not a client of her own product", async () => {
  // Nina's members row is role = 'admin'. A workspace for her would put
  // her in the member list and send her two reminders a month about a
  // report she does not have.
  const result = await asMember(db, NINA, () =>
    db.query(`select public.ensure_member_report_workspace('${NINA}') is null as skipped`));
  assert.equal(result.rows[0].skipped, true, "returns null rather than making one");
  assert.equal((await workspacesFor(NINA)).length, 0);

  // Including a second admin. Seeded without a session, like the rest
  // of the fixtures — RLS on `members` is not what is under test here.
  await db.exec(`insert into public.members (id, email, full_name, role, status)
                 values ('${SECOND_ADMIN}', 'dom@allegro.test', 'Dom', 'admin', 'active')`);
  await asMember(db, NINA, () =>
    db.query(`select public.ensure_member_report_workspace('${SECOND_ADMIN}')`));
  assert.equal((await workspacesFor(SECOND_ADMIN)).length, 0);
});

test("somebody who is not a member at all gets none", async () => {
  // A retainer client has a login and no `members` row by design.
  const result = await asMember(db, NINA, () =>
    db.query(`select public.ensure_member_report_workspace(
      '99999999-9999-9999-9999-999999999999') is null as nothing`));
  assert.equal(result.rows[0].nothing, true);
});

test("the service role gets through, because a backfill has no JWT", async () => {
  // The trap this codebase has been bitten by twice: a guard admitting
  // only `is_portal_admin()` refuses the system, whose `auth.uid()` is
  // null. A backfill or a later activation job runs exactly this way.
  const LATER = "66666666-6666-6666-6666-666666666666";
  await db.exec(`
    insert into auth.users (id, email) values ('${LATER}','later@member.test');
    insert into public.members (id, email, full_name, role, status, join_date)
      values ('${LATER}','later@member.test','Later Joiner','member','active','2026-09-02');
  `);

  // No `asMember`, so no JWT and `auth.uid()` is null — the service role.
  await db.query(`select public.ensure_member_report_workspace('${LATER}')`);
  const found = await workspacesFor(LATER);
  assert.equal(found.length, 1, "the backfill can do its job");
  assert.equal(found[0].first_month, "2026-09-01");
});

test("and an ordinary member cannot give themselves one", async () => {
  const OUTSIDER = "77777777-7777-7777-7777-777777777777";
  await db.exec(`
    insert into auth.users (id, email) values ('${OUTSIDER}','out@member.test');
    insert into public.members (id, email, full_name, role, status)
      values ('${OUTSIDER}','out@member.test','Outsider','member','active');
  `);
  await assert.rejects(
    () => asMember(db, OUTSIDER, () =>
      db.query(`select public.ensure_member_report_workspace('${OUTSIDER}')`)),
    /Only an admin/,
  );
});
