/**
 * Paging the admin client list across ties.
 *
 * `.range()` paging is two separate queries. If the sort is not unique,
 * Postgres may order the tied rows differently in each, so a row can land
 * in both pages or in neither. The result is a count that is quietly wrong
 * — which is the exact failure paging was added to prevent.
 *
 * Every row below shares its sort key with every other, so if the unique
 * tiebreaker is missing the sort is entirely arbitrary and the odds of
 * noticing are good. Dom caught this on review of the paging fix.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { getReportClientData } = await import("../../src/lib/admin/report-clients.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values ('${NINA}', 'nina@allegro.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}', 'nina@allegro.test', 'Nina', 'admin', 'active');
`);

// Seven clients, every one of them called the same thing, so business_name
// is useless as a sort. Their periods share two months, likewise.
const clientUser = (i) => `22222222-0000-0000-0000-${String(i).padStart(12, "0")}`;

// Two team logins on every workspace, so workspace_id ties three ways in
// report_access as well. With one grant each, workspace_id would have been
// unique by accident and the sort's instability invisible.
const TEAM = [
  ["33333333-0000-0000-0000-000000000001", "Elize"],
  ["33333333-0000-0000-0000-000000000002", "Nina"],
];
const GRANTS_PER_CLIENT = 1 + TEAM.length;

const CLIENTS = 7;
const ids = [];

// The client logins first, as superuser: auth.users is not a member's to write.
for (let i = 0; i < CLIENTS; i++) {
  await db.exec(
    `insert into auth.users (id, email) values ('${clientUser(i)}', 'c${i}@test')`,
  );
}
for (const [id, name] of TEAM) {
  await db.exec(
    `insert into auth.users (id, email) values ('${id}', '${name.toLowerCase()}@allegro.test')`,
  );
}

await asMember(db, NINA, async () => {
  for (let i = 0; i < CLIENTS; i++) {
    const { rows } = await db.query(`
      select (public.create_report_workspace(
        '${clientUser(i)}', 'retainer', 'Same Name Ltd', 'Client ${i}', '2026-01-01')).id as id`);
    ids.push(rows[0].id);
    // Two periods each, both in months shared with every other client.
    await db.query(`
      insert into public.report_periods (workspace_id, month)
      values ('${rows[0].id}', '2026-08-01'), ('${rows[0].id}', '2026-09-01')`);
    for (const [user, name] of TEAM) {
      await db.query(`
        select public.assign_report_team_member(
          '${rows[0].id}', '${user}', '${name}')`);
    }
  }
});

configure(db, NINA);

const unique = (xs) => new Set(xs).size === xs.length;

test("every client comes back exactly once, across page boundaries", async () => {
  // pageSize 2 puts a boundary inside a run of identically-named rows.
  const { workspaces } = await getReportClientData({ pageSize: 2 });

  assert.equal(workspaces.length, CLIENTS, "none lost, none doubled");
  assert.ok(unique(workspaces.map((w) => w.id)), "no id appears twice");
  assert.deepEqual(
    [...workspaces.map((w) => w.id)].sort(),
    [...ids].sort(),
    "the same set the database holds",
  );
});

test("every period comes back exactly once, across page boundaries", async () => {
  // Fourteen rows sharing two month values, paged three at a time.
  const { periods } = await getReportClientData({ pageSize: 3 });

  assert.equal(periods.length, CLIENTS * 2);
  assert.ok(
    unique(periods.map((p) => `${p.workspace_id}|${p.month}`)),
    "no workspace/month pair appears twice",
  );
  for (const id of ids) {
    assert.equal(
      periods.filter((p) => p.workspace_id === id).length,
      2,
      "each client still has both of its months",
    );
  }
});

test("every grant comes back exactly once, across page boundaries", async () => {
  const { grants } = await getReportClientData({ pageSize: 2 });

  assert.equal(
    grants.length,
    CLIENTS * GRANTS_PER_CLIENT,
    "the client plus both team logins, on every workspace",
  );
  assert.ok(
    unique(grants.map((g) => `${g.workspace_id}|${g.user_id}`)),
    "no grant appears twice",
  );
});

test("the page size makes no difference to the answer", async () => {
  // If a boundary ever duplicated or dropped a row, the totals would move
  // with the page size. They must not.
  const sizes = [1, 2, 3, 5, 13, 1000];
  const counts = [];
  for (const pageSize of sizes) {
    const data = await getReportClientData({ pageSize });
    counts.push(`${data.workspaces.length}/${data.grants.length}/${data.periods.length}`);
  }
  assert.equal(
    new Set(counts).size,
    1,
    `counts differed by page size: ${sizes.map((s, i) => `${s}=>${counts[i]}`).join(" ")}`,
  );
});
