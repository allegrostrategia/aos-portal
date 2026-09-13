/**
 * Adding a build, Nina's comment on it, the member's SOP for it, and changing
 * what it's worth.
 *
 * Rewritten 13 Sep 2026 for the L'Editoriale SOP flow. This file used to prove
 * that Nina's write-up published in one update ("body saved, confirmed_at
 * null" was the report that prompted it). That flow is gone: Nina leaves a
 * comment, the member writes the SOP on the same row. What the file proves now
 * is the shape of the new flow — the comment is Nina's alone, the SOP is the
 * member's alone, the title of a build stays Nina's, and neither write
 * disturbs the other.
 *
 * The distinction worth holding onto is unchanged: a `member_sop` never sets
 * `confirmed_at`, because it is the member's own work with nothing for Nina to
 * confirm.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { addBuild, saveCoachNote, changeBuildRate } = await import(
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
    `select id, title, body, confirmed_at, confirmed_by, drafted_by, source, coach_note, sop, member_edited_at
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

test("Nina's comment saves, and publishes nothing", async () => {
  configure(db, NINA);
  const before = await buildRow();
  const result = await saveCoachNote(null, form({
    handover_pack_id: before.id, coach_note: "Start with the trigger, not the tool.",
  }));

  assert.equal(result?.error, undefined);
  const after = await buildRow();
  assert.equal(after.coach_note, "Start with the trigger, not the tool.");
  // The old flow set these on save. The new one never does — there is
  // nothing to publish; the member writes the record.
  assert.equal(after.body, null);
  assert.equal(after.confirmed_at, null);
});

test("the member writes the SOP for the build, keeping Nina's title and comment", async () => {
  configure(db, RUTH);
  const build = await buildRow();
  // Updating an existing entry returns a notice; only a new entry redirects.
  const result = await saveSop(null, form({
    id: build.id,
    title: "My own name for it",           // ignored on a build — Nina named it
    trigger: "An enquiry lands",
    outcome: "They have a reply within the hour",
    owner: "Me",
    tools: "Gmail",
  }));
  assert.equal(result?.error, undefined);

  const after = await buildRow();
  assert.equal(after.title, build.title, "a build keeps the name Nina gave it");
  assert.equal(after.coach_note, "Start with the trigger, not the tool.");
  assert.ok(after.sop, "the member's SOP is on the build's own row");
  assert.equal(after.sop.owner, "Me");
  assert.ok(after.member_edited_at);
});

test("clearing the comment leaves the member's SOP alone", async () => {
  configure(db, NINA);
  const build = await buildRow();
  await saveCoachNote(null, form({ handover_pack_id: build.id, coach_note: "" }));
  const after = await buildRow();
  assert.equal(after.coach_note, null);
  assert.equal(after.sop.owner, "Me");
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

test("changing the rate leaves the comment and the SOP alone", async () => {
  configure(db, NINA);
  const build = await buildRow();
  await changeBuildRate(null, form({
    handover_pack_id: build.id, intent: "revise",
    hours_per_week: "3", effective_date: "2026-10-01",
  }));

  const after = await buildRow();
  assert.equal(after.coach_note, null);
  assert.equal(after.sop.owner, "Me");
});
