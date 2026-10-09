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
  assert.equal(await planReportReminders(at("2026-10-05")), 0);
  assert.equal((await queued()).length, 0);
});

test("on the 1st: the member, and nobody else", async () => {
  const planned = await planReportReminders(at("2026-10-01"));
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
  assert.equal(await planReportReminders(at("2026-10-01")), 0);
  assert.equal((await queued()).length, 1);
});

test("on the 8th, a month already recorded as reminded is left alone", async () => {
  await db.exec(`insert into public.report_reminders (workspace_id, month, reminder, sent_at)
                 values ('${WS.member}', '2026-09-01', 2, now());`);

  const planned = await planReportReminders(at("2026-10-08"));
  const second = (await queued()).filter((r) => r.kind === "report_reminder_2");
  assert.equal(second.length, planned);
  assert.ok(
    !second.some((r) => r.workspace_id === WS.member),
    "the second one had already gone out for this member",
  );
  assert.equal(second.length, 0, "and there is nobody else left to get it");
});
