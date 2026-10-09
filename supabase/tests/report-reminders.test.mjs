/**
 * §8.1's two report reminders, planned against a real database as the
 * service role — which is how the cron runs, and the thing that has
 * caught this codebase out twice.
 *
 * The rules themselves are unit-tested in
 * `src/lib/reporting/reminder-plan.test.ts`. This is the half that
 * reads and writes: who is found, who is excluded, and that nothing
 * sends twice.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

// **Run the module at Stage 5.** `SHIPPED_STAGE` is read once, at
// import, and outside a development server it is pinned to
// `PRODUCTION_STAGE` — which would leave `ENTRY_CATEGORIES` holding only
// the Stage 2 sections. A "finished month" would then be finished by
// having nothing in it, and every completion rule under test here would
// be unreachable. Set before the import, because after it is too late.
process.env.NODE_ENV = "development";
process.env.NEXT_PUBLIC_REPORTING_STAGE = "5";

const { planReportReminders } = await import("../../src/lib/jobs/runner.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const CANCELLED = "33333333-3333-3333-3333-333333333333";
const ATTENDEE = "44444444-4444-4444-4444-444444444444";
const RETAINER_CLIENT = "55555555-5555-5555-5555-555555555555";

const db = await createTestDatabase();
// No session: the cron has no JWT, and `auth.uid()` is null throughout.
configure(db, null);

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${MEMBER}','ruth@member.test'),
    ('${CANCELLED}','gone@member.test'), ('${ATTENDEE}','chiara@attendee.test'),
    ('${RETAINER_CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active'),
    ('${MEMBER}','ruth@member.test','Ruth Fairweather','member','active'),
    ('${CANCELLED}','gone@member.test','Gone Away','member','cancelled');
`);

const make = async (owner, kind, name, accessEnd = null) => {
  const { rows } = await asMember(db, NINA, () =>
    db.query(`select (public.create_report_workspace(
      '${owner}', '${kind}', '${name}', '${name}', '2026-08-01', 'GBP',
      ${accessEnd ? `'${accessEnd}'` : "null"})).id as id`));
  return rows[0].id;
};

const WS = {};
WS.member = await make(MEMBER, "aos_member", "Ruth Coaching");
WS.cancelled = await make(CANCELLED, "aos_member", "Gone Coaching");
WS.live = await make(ATTENDEE, "chiarezza", "Chiara Live", "2026-12-31");
WS.ended = await make(ATTENDEE, "chiarezza", "Chiara Ended", "2026-09-30");
WS.retainer = await make(RETAINER_CLIENT, "retainer", "Northwind");

const queued = async () =>
  (await asMember(db, NINA, () => db.query(
    `select kind::text, member_id, payload->>'workspace_id' as workspace_id,
            payload->>'month' as month
       from public.due_jobs where kind::text like 'report_reminder%' order by kind`,
  ))).rows;

/** 08:00 UTC on a UK date, which is when the cron runs. */
const at = (iso) => new Date(`${iso}T08:00:00Z`);

test("nothing on a day that is not the 1st or the 8th", async () => {
  assert.equal(await planReportReminders(at("2026-10-05"), 5), 0);
  assert.equal((await queued()).length, 0);
});

test("on the 1st: the member, and nobody else", async () => {
  const planned = await planReportReminders(at("2026-10-01"), 5);
  assert.equal(planned, 1, "one queued");

  const rows = await queued();
  const workspaces = rows.map((r) => r.workspace_id).sort();
  assert.deepEqual(workspaces, [WS.member]);

  // Every one of the exclusions, named so a failure says which.
  assert.ok(!workspaces.includes(WS.retainer), "a retainer client: Allegro fills theirs in");
  assert.ok(!workspaces.includes(WS.cancelled), "a cancelled member: rule 7");
  // Chiarezza gets none at all — §8.1 names only aOS members, and
  // `due_jobs.member_id` is a foreign key to `members`, which an
  // attendee does not have. Both of these would be queued if that
  // changed, so both are asserted.
  assert.ok(!workspaces.includes(WS.live), "a Chiarezza login inside its end date");
  assert.ok(!workspaces.includes(WS.ended), "and one past it");

  // About the month that just ended.
  assert.deepEqual([...new Set(rows.map((r) => r.month))], ["2026-09-01"]);
  assert.deepEqual([...new Set(rows.map((r) => r.kind))], ["report_reminder_1"]);
});

test("running again the same morning queues nothing more", async () => {
  // A catch-up run after a missed day must not send a second copy; the
  // dedupe key is per workspace, month and reminder.
  assert.equal(await planReportReminders(at("2026-10-01"), 5), 0);
  assert.equal((await queued()).length, 1);
});

test("on the 8th, a month already recorded as reminded is left alone", async () => {
  await db.exec(`insert into public.report_reminders (workspace_id, month, reminder, sent_at)
                 values ('${WS.member}', '2026-09-01', 2, now());`);

  const planned = await planReportReminders(at("2026-10-08"), 5);
  const second = (await queued()).filter((r) => r.kind === "report_reminder_2");
  assert.equal(second.length, planned);
  assert.ok(
    !second.some((r) => r.workspace_id === WS.member),
    "the second one had already gone out for this member",
  );
  assert.equal(second.length, 0, "and there is nobody else left to get it");
});

test("nothing is planned at all below Stage 5, on the day it would fire", async () => {
  // **The one piece of unfinished work that reaches outside the app.**
  // `dom` has had a real `aos_member` workspace on live since the
  // backfill of 9 October, so without this switch the 1st of November
  // would have put "time to fill in your report for October" in a real
  // inbox, from a stage nobody had turned on. Caught by Dom before any
  // of it was pushed.
  //
  // Asked on the 1st, which is the day it WOULD fire, and with the
  // reminders table cleared so nothing else could be the reason.
  await db.exec(`delete from public.due_jobs where kind::text like 'report_reminder%';
                 delete from public.report_reminders;`);

  for (const stage of [2, 3, 4]) {
    assert.equal(
      await planReportReminders(at("2026-11-01"), stage),
      0,
      `stage ${stage} plans nothing`,
    );
    assert.equal((await queued()).length, 0, `and queues nothing at stage ${stage}`);
  }

  // And the same morning at Stage 5 does, so the test above is not
  // passing because there was nobody to remind.
  assert.equal(await planReportReminders(at("2026-11-01"), 5), 1);
});

test("a member workspace whose owner has no members row is skipped, not thrown over", async () => {
  // `create_report_workspace` does not require a `members` row, so an
  // `aos_member` workspace can exist without one — and `due_jobs`
  // member_id is a foreign key to `members`. Queuing it fails the key
  // and throws, which would take the planning of everybody else down
  // with it on that morning. There is also nobody to email.
  //
  // Found by a mutation: the error check after the queue write could be
  // deleted with nothing failing, which meant the only path that could
  // reach it was one nothing created.
  const ORPHAN = "88888888-8888-8888-8888-888888888888";
  await db.exec(`insert into auth.users (id, email) values ('${ORPHAN}','orphan@test');`);
  const orphanWs = await make(ORPHAN, "aos_member", "Unclaimed Coaching");

  await db.exec(`delete from public.due_jobs where kind::text like 'report_reminder%';
                 delete from public.report_reminders;`);

  const planned = await planReportReminders(at("2026-10-01"), 5);
  assert.equal(planned, 1, "the real member is still planned for");
  const rows = await queued();
  assert.ok(
    !rows.some((r) => r.workspace_id === orphanWs),
    "and the one with nobody behind it is left alone",
  );

  await db.exec(`delete from public.report_workspaces where id = '${orphanWs}';`);
});

test("the send checks again: somebody who filled it in since 08:00 is not chased", async () => {
  // The second check, and the one that matters — the morning the queue
  // is long is exactly when somebody finishes between the planning and
  // the send. Untested until a mutation showed the recheck could be
  // deleted with nothing failing.
  const { runReportReminder } = await import("../../src/lib/jobs/runner.ts");
  const { createAdminClient } = await import("./stubs/supabase-admin.mjs");
  const admin = createAdminClient();

  const job = {
    member_id: MEMBER,
    kind: "report_reminder_2",
    payload: { workspace_id: WS.member, month: "2026-09-01", reminder: 2 },
  };

  // Nothing is filled in, so it is still owed and it goes.
  assert.equal(await runReportReminder(admin, job), "sent");
  // And it is recorded, which is what stops a third.
  const recorded = await asMember(db, NINA, () => db.query(
    `select count(*)::int c from public.report_reminders
       where workspace_id = '${WS.member}' and month = '2026-09-01' and reminder = 2`));
  assert.equal(recorded.rows[0].c, 1);

  // Now finish the month: every visible section's core, and the opening
  // figure in an EARLIER month, which is where it is asked.
  await db.exec(`
    update public.report_workspaces
       set hidden_categories = (
         select coalesce(array_agg(c), '{}') from unnest(enum_range(null::public.report_category)) c
          where c::text not in ('overview','client_experience'))
     where id = '${WS.member}';
    insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
    values
      ('${WS.member}', '2026-08-01', 'client_experience_clients_at_start_opening', 10, '${NINA}'),
      ('${WS.member}', '2026-09-01', 'client_experience_clients_who_left', 1, '${NINA}'),
      ('${WS.member}', '2026-09-01', 'client_experience_renewals_and_upsells', 2, '${NINA}'),
      ('${WS.member}', '2026-09-01', 'client_experience_issues_raised', 0, '${NINA}');
  `);

  assert.equal(
    await runReportReminder(admin, job),
    "skipped",
    "finished since the queue was planned, so nothing is sent",
  );
});
