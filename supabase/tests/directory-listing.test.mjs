/**
 * Who the directory actually lists, through the app's own query.
 *
 * The policy on `member_profiles` gates on `has_portal_access()`, which reads
 * `auth.uid()` — the person LOOKING. There is a test for that side already
 * ("a cancelled member sees no directory at all"). This file is the other
 * side: whether the people LISTED are still members.
 *
 * They weren't checked at all until 29 October. The migration that wrote the
 * policy said the listing query had to do it, the listing query never did, and
 * no test covered it — so a cancelled member kept their card in every other
 * member's directory, and kept their row in the "new message" list that calls
 * `searchDirectory("")`, where clicking them failed on `open_direct_channel`.
 *
 * Through `searchDirectory()` rather than against the function it calls, so a
 * version of the query that forgets to apply the answer still fails. Profiles
 * here carry no headshot on purpose: the signing step reaches for storage,
 * which the shim has no answer for, and this is not the test for photos.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Registers the module hooks; must come before the dynamic imports below.
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { searchDirectory } = await import("../../src/lib/directory/queries.ts");
const { saveDirectoryListing } = await import("../../src/lib/onboarding/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const OMAR = "33333333-3333-3333-3333-333333333333";
const PAT = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();

// Outside asMember: inserting into `auth` needs the owner, and the member
// session has no rights there.
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'),
    ('${RUTH}','ruth@test'),
    ('${OMAR}','omar@test'),
    ('${PAT}','pat@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina','admin','active');
`);

await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [RUTH, "ruth@test", "Ruth Bell"],
    [OMAR, "omar@test", "Omar Diaz"],
    [PAT, "pat@test", "Pat Nkemelu"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
});

/** A complete listing, written the way the member writes it. */
async function list(memberId, displayName, bio) {
  configure(db, memberId);
  const data = new FormData();
  data.append("display_name", displayName);
  data.append("bio", bio);
  // Saving redirects on success, so the redirect is the signal.
  await assert.rejects(() => saveDirectoryListing(null, data), /REDIRECT:\/onboarding/);
}

await list(RUTH, "Ruth Bell", "I help agencies fix delivery.");
await list(OMAR, "Omar Diaz", "Brand photography for founders.");
await list(PAT, "Pat Nkemelu", "Pricing and packaging for consultants.");

/** The names the directory shows to `reader`, in order. */
async function namesSeenBy(reader, query = "") {
  configure(db, reader);
  const entries = await searchDirectory(query);
  return entries.map((e) => e.displayName);
}

const status = async (memberId) =>
  (await asMember(db, NINA, () =>
    db.query(`select status from public.members where id='${memberId}'`),
  )).rows[0].status;

test("all three active members are listed", async () => {
  assert.deepEqual(await namesSeenBy(RUTH), [
    "Omar Diaz",
    "Pat Nkemelu",
    "Ruth Bell",
  ]);
});

test("a cancelled member drops out of the directory", async () => {
  await asMember(db, NINA, () => db.query(`select public.cancel_member('${OMAR}')`));
  assert.equal(await status(OMAR), "cancelled");

  const names = await namesSeenBy(RUTH);
  assert.ok(!names.includes("Omar Diaz"), `Omar should be gone, got ${names.join(", ")}`);
  assert.deepEqual(names, ["Pat Nkemelu", "Ruth Bell"]);
});

test("their row is still there — nothing was deleted", async () => {
  const row = await asMember(db, NINA, () =>
    db.query(
      `select display_name, completed_at from public.member_profiles
       where member_id='${OMAR}'`,
    ),
  );
  assert.equal(row.rows[0].display_name, "Omar Diaz");
  assert.ok(row.rows[0].completed_at, "the listing stays complete, it just isn't shown");
});

// The gap was first found through the "new message" list, which calls this
// with an empty query. A searched directory runs a different branch — the
// text-search filter — so it gets its own assertion rather than being assumed.
test("a search doesn't bring a cancelled member back", async () => {
  const names = await namesSeenBy(RUTH, "photography");
  assert.deepEqual(names, [], "Omar's own bio should no longer find him");
});

test("a member still in onboarding isn't listed yet", async () => {
  await asMember(db, NINA, () => db.query(`select public.rejoin_member('${OMAR}')`));
  assert.equal(await status(OMAR), "onboarding");

  const names = await namesSeenBy(RUTH);
  assert.ok(
    !names.includes("Omar Diaz"),
    `rejoining is onboarding again, not instant reactivation; got ${names.join(", ")}`,
  );
});

test("activating them puts them back", async () => {
  await asMember(db, NINA, () => db.query(`select public.activate_member('${OMAR}')`));
  assert.deepEqual(await namesSeenBy(RUTH), [
    "Omar Diaz",
    "Pat Nkemelu",
    "Ruth Bell",
  ]);
});

// A cancelled member reads nothing at all — the policy's side, asserted here
// too because `searchDirectory` now makes a second call, and a filter built
// from an empty answer must not fall open.
test("a cancelled member sees an empty directory, not everyone", async () => {
  await asMember(db, NINA, () => db.query(`select public.cancel_member('${PAT}')`));
  assert.deepEqual(await namesSeenBy(PAT), []);
});
