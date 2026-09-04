/**
 * Saving a directory listing, through the app's own action.
 *
 * The guard worth testing is the headshot path. It arrives from the browser and
 * ends up in a row every other member reads, so a listing must not be able to
 * *claim* somebody else's photo — the storage policy stops anyone writing
 * outside their own prefix, and stops nothing about what a row points at.
 *
 * Same shape as the voice-message forgery guard, which was already covered. This
 * one wasn't: a mutation removing it broke nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Registers the module hooks; must come before the dynamic import below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveDirectoryListing } = await import("../../src/lib/onboarding/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const OMAR = "33333333-3333-3333-3333-333333333333";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test'), ('${OMAR}','omar@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [RUTH, "ruth@test", "Ruth Bell"],
    [OMAR, "omar@test", "Omar Diaz"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
});

function listing(fields = {}) {
  const data = new FormData();
  data.append("display_name", "Ruth Bell");
  data.append("bio", "I help agencies fix delivery.");
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const profile = async (memberId) =>
  (await db.query(
    `select display_name, headshot_path from public.member_profiles where member_id='${memberId}'`,
  )).rows[0];

// Saving successfully redirects, so the redirect *is* the success signal — a
// returned value means it refused.
const saved = (fields) =>
  assert.rejects(
    () => saveDirectoryListing(null, listing(fields)),
    /REDIRECT:\/onboarding/,
  );

test("a listing saves with the member's own photo", async () => {
  configure(db, RUTH);
  await saved({ headshot_path: `${RUTH}/abc123.jpg` });
  assert.equal((await profile(RUTH)).headshot_path, `${RUTH}/abc123.jpg`);
});

// The forgery this guards: the storage policy stops Ruth writing into Omar's
// folder, and stops nothing about her listing pointing at what's in it.
test("a listing cannot claim somebody else's photo", async () => {
  configure(db, RUTH);
  const result = await saveDirectoryListing(
    null,
    listing({ headshot_path: `${OMAR}/theirs.jpg` }),
  );

  assert.match(result?.error ?? "", /isn't yours to use/);
  assert.equal((await profile(RUTH)).headshot_path, `${RUTH}/abc123.jpg`);
});

test("a path that merely starts with their id isn't theirs either", async () => {
  configure(db, RUTH);
  const result = await saveDirectoryListing(
    null,
    listing({ headshot_path: `${RUTH}-evil/theirs.jpg` }),
  );

  assert.match(result?.error ?? "", /isn't yours to use/);
});

test("removing the photo stores nothing rather than an empty string", async () => {
  configure(db, RUTH);
  await saved({ headshot_path: "" });
  assert.equal((await profile(RUTH)).headshot_path, null);
});

test("a listing without a photo is still a complete listing", async () => {
  configure(db, OMAR);
  const data = new FormData();
  data.append("display_name", "Omar Diaz");
  data.append("bio", "Brand photography for founders.");

  await assert.rejects(
    () => saveDirectoryListing(null, data),
    /REDIRECT:\/onboarding/,
  );

  const row = await db.query(
    `select completed_at from public.member_profiles where member_id='${OMAR}'`,
  );
  assert.ok(row.rows[0].completed_at, "it should still count as complete");
});
