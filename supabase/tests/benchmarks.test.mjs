/**
 * Benchmarks (§7): the reply is read, never invented.
 *
 * CLAUDE.md rule 2 in its sharpest form. A made-up industry average
 * would be drawn as a traffic light and read as fact, so every line the
 * parser cannot read is kept and shown rather than filled in.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveBenchmarkReply } = await import("../../src/lib/reporting/benchmark-actions.ts");
const { getBenchmarks } = await import("../../src/lib/reporting/queries.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
await asMember(db, NINA, async () => {
  WS = (await db.query(`select (public.create_report_workspace(
    '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '2026-08-01')).id as id`)).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
});

const as = (uid, fn) => { configure(db, uid); return fn(); };
const form = (reply) => {
  const f = new FormData();
  f.append("workspace_id", WS);
  f.append("reply", reply);
  return f;
};
const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;

test("a reply is read into benchmarks, and the rest is handed back", async () => {
  const result = await as(NINA, () =>
    saveBenchmarkReply(null, form(
      `Average open rate: 42%
       Unsubscribe rate: 0.4%
       Open rate: 39%
       Webinar show-up rate: 48%
       Churn rate: between 4 and 6`,
    )),
  );

  assert.equal(result?.error, undefined, result?.error);
  assert.match(result?.notice ?? "", /2 benchmarks saved/);
  // "Open rate" is not a metric — the metric is "Average open rate" —
  // so it comes back rather than being matched to the nearest thing.
  // Guessing here would put a number nobody said behind a traffic light.
  assert.deepEqual(result?.unmatched, [
    "Open rate: 39%",
    "Webinar show-up rate: 48%",
    "Churn rate: between 4 and 6",
  ]);

  configure(db, NINA);
  const stored = await getBenchmarks(WS);
  assert.equal(stored.get("email_average_open_rate"), 42);
  assert.equal(stored.get("email_unsubscribe_rate"), 0.4);
  assert.equal(stored.get("client_experience_churn_rate"), undefined, "a range is nobody's answer");
});

test("what could not be read is kept, so nobody has to work it out twice", async () => {
  const [row] = await rows(
    `select benchmarks_unmatched, benchmarks_set_at from public.report_workspaces where id = '${WS}'`,
  );
  assert.match(String(row.benchmarks_unmatched), /Webinar show-up rate/);
  assert.ok(row.benchmarks_set_at, "and when it was last done");
});

test("a reply with nothing readable in it saves nothing", async () => {
  const before = (await rows(
    `select count(*)::int c from public.report_benchmarks where workspace_id = '${WS}'`,
  ))[0].c;

  const result = await as(NINA, () =>
    saveBenchmarkReply(null, form("It really depends on your niche, I'd say.")),
  );
  assert.match(result?.error ?? "", /could be read/);

  const after = (await rows(
    `select count(*)::int c from public.report_benchmarks where workspace_id = '${WS}'`,
  ))[0].c;
  assert.equal(after, before, "and nothing was invented to fill the gap");
});

test("pasting again replaces a benchmark rather than adding a second", async () => {
  await as(NINA, () => saveBenchmarkReply(null, form("Unsubscribe rate: 0.3%")));

  const stored = await rows(`
    select count(*)::int c from public.report_benchmarks
     where workspace_id = '${WS}' and metric_key = 'email_unsubscribe_rate'`);
  assert.equal(stored[0].c, 1);

  configure(db, NINA);
  assert.equal((await getBenchmarks(WS)).get("email_unsubscribe_rate"), 0.3);
});

test("an assigned team member can paste one; the client cannot", async () => {
  const elize = await as(ELIZE, () => saveBenchmarkReply(null, form("Average open rate: 44%")));
  assert.equal(elize?.error, undefined, elize?.error);

  const refused = await as(CLIENT, () => saveBenchmarkReply(null, form("Average open rate: 99%")));
  assert.match(refused?.error ?? "", /set by your strategist/);

  configure(db, NINA);
  assert.equal((await getBenchmarks(WS)).get("email_average_open_rate"), 44);
});

test("the new columns sit on the editor side of the workspace guard", async () => {
  // report_workspaces has guard_report_workspace_admin_fields, which
  // holds back kind, owner, access window and first month from anyone
  // but an admin. benchmarks_set_at and benchmarks_unmatched are
  // deliberately NOT in that list: its own comment says "an editor may
  // set hidden categories, benchmark answers, target rate, name and
  // currency", and pasting a reply is exactly that.
  //
  // A retainer client is held back a layer earlier, by the update
  // policy, because report_can_edit() is false for them — so no trigger
  // is needed and adding one would be belt over a belt.
  const blocked = await rows(`
    select pg_get_functiondef(oid) as def from pg_proc
     where proname = 'guard_report_workspace_admin_fields'`);
  assert.ok(
    !/benchmarks_set_at|benchmarks_unmatched/.test(blocked[0].def),
    "the guard must not hold back the benchmark columns from an editor",
  );
  assert.match(blocked[0].def, /first_month/, "and must still hold back the ones it did");

  // Elize, through the real action, writes both.
  await as(ELIZE, () => saveBenchmarkReply(null, form("Average open rate: 41%")));
  const [stamped] = await rows(`
    select benchmarks_set_at is not null as stamped from public.report_workspaces where id = '${WS}'`);
  assert.equal(stamped.stamped, true);

  // The client cannot, and it is the policy that stops them.
  await asMember(db, CLIENT, async () => {
    const { rows: changed } = await db.query(`
      update public.report_workspaces set benchmarks_set_at = null
       where id = '${WS}' returning id`);
    assert.equal(changed.length, 0, "RLS admits no update of theirs at all");
  });
  const [after] = await rows(`
    select benchmarks_set_at is not null as stamped from public.report_workspaces where id = '${WS}'`);
  assert.equal(after.stamped, true, "unchanged");
});
