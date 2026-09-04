/**
 * Adding a build, writing it up, and changing what it's worth.
 *
 * Written while chasing a report that a write-up had saved without publishing.
 * It hadn't — the action sets the body and `confirmed_at` in one update, so the
 * two cannot disagree — but nothing here proved that, which is why the question
 * took a live database to answer.
 *
 * The distinction worth holding onto: a `member_sop` never sets `confirmed_at`,
 * because it is the member's own work with nothing for Nina to confirm. A build
 * write-up always does. Reading one row's column as though it meant the same
 * thing for the other is what made the report confusing.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { addBuild, saveWriteUp, changeBuildRate } = await import(
  "../../src/lib/admin/hours-actions.ts"
);
const { saveSop } = await import("../../src/lib/sop/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values ('${NINA}','nina@test'), ('${RUTH}','ruth@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@test','Nina','admin','active');`);
await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${RUTH}','ruth@test','Ruth Bell', now(), now())`);
  await db.query(`select public.activate_member('${RUTH}')`);
});

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const buildRow = async () =>
  (await db.query(
    `select id, body, confirmed_at, confirmed_by, drafted_by, source
     from public.handover_pack where member_id='${RUTH}' and source='hot_seat'`,
  )).rows[0];

test("a member cannot add a build to their own pack", async () => {
  configure(db, RUTH);
  await assert.rejects(
    () =>
      addBuild(null, form({
        member_id: RUTH, title: "Mine", hours_per_week: "5",
        effective_from: "2026-09-01",
      })),
    /REDIRECT:\/piazza/,
  );
});

test("adding a build leaves it unwritten and unpublished", async () => {
  configure(db, NINA);
  const result = await addBuild(null, form({
    member_id: RUTH, title: "Enquiry follow-up",
    hours_per_week: "5", effective_from: "2026-09-01",
  }));

  assert.equal(result?.error, undefined);
  const build = await buildRow();
  assert.equal(build.body, null);
  assert.equal(build.confirmed_at, null, "nothing to publish until it's written");
});

// The report that prompted this file: body saved, confirmed_at null. The action
// writes both in one update, so that pairing cannot happen.
test("writing it up sets the body and publishes in one go", async () => {
  configure(db, NINA);
  const before = await buildRow();
  const result = await saveWriteUp(null, form({
    handover_pack_id: before.id, body: "What we built together.",
  }));

  assert.equal(result?.error, undefined);
  const after = await buildRow();
  assert.equal(after.body, "What we built together.");
  assert.ok(after.confirmed_at, "publishing is not a separate step");
  assert.equal(after.confirmed_by, NINA);
});

test("an empty write-up is refused rather than publishing nothing", async () => {
  configure(db, NINA);
  const build = await buildRow();
  const result = await saveWriteUp(null, form({
    handover_pack_id: build.id, body: "   ",
  }));

  assert.match(result?.error ?? "", /empty write-up/);
  assert.equal((await buildRow()).body, "What we built together.");
});

test("nothing in the product drafts it, so it's recorded as Nina's", async () => {
  assert.equal((await buildRow()).drafted_by, "nina");
});

// The distinction that made the original report confusing.
test("a member's own SOP is never published — there's nothing to confirm", async () => {
  configure(db, RUTH);
  await assert.rejects(
    () => saveSop(null, form({ title: "Onboarding a client", trigger: "They sign" })),
    /REDIRECT/,
  );

  const sop = (await db.query(
    `select confirmed_at, source from public.handover_pack
     where member_id='${RUTH}' and source='member_sop'`,
  )).rows[0];

  assert.equal(sop.confirmed_at, null);
  assert.equal(sop.source, "member_sop");
});

test("changing the rate leaves the write-up alone", async () => {
  configure(db, NINA);
  const build = await buildRow();
  await changeBuildRate(null, form({
    handover_pack_id: build.id, intent: "revise",
    hours_per_week: "3", effective_date: "2026-10-01",
  }));

  const after = await buildRow();
  assert.equal(after.body, "What we built together.");
  assert.ok(after.confirmed_at);
});
