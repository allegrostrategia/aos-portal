/**
 * Where a sign-in actually sends people, driven through the real action.
 *
 * On 5 October Dom signed in on localhost as a retainer client and landed on
 * "Your account isn't ready yet" — because the login URL still carried
 * `?next=/no-access` from a tab that had been left open while signed out.
 * The proxy sets `next` to whatever page was asked for, and the action
 * honoured it as long as it was an internal path. Internal is not the same
 * as theirs to use.
 *
 * `usableNextPath` has unit tests. This one drives `signIn` against a real
 * database as a real retainer client and a real admin, because the decision
 * needs to know which door the login has, and that is a query — the part a
 * pure test cannot check.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { signIn } = await import("../../src/lib/auth/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const NINA_EMAIL = "nina@allegro.test";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const CLIENT_EMAIL = "bella@client.test";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','${NINA_EMAIL}'), ('${CLIENT}','${CLIENT_EMAIL}');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','${NINA_EMAIL}','Nina','admin','active');
`);

// A retainer client: an auth.users row, no members row, one reporting grant.
let workspace;
await asMember(db, NINA, async () => {
  const { rows } = await db.query(`
    select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Bella Ltd', 'Bella', '2026-08-01')).id as id`);
  workspace = rows[0].id;
});

/**
 * Sign in as `uid` and return where they were sent.
 *
 * redirect() signals by throwing, so the destination arrives as an error —
 * which is also the proof the action really did redirect rather than return.
 */
async function signInAs(uid, email, next) {
  configure(db, uid);
  const form = new FormData();
  form.set("email", email);
  form.set("password", "correct horse battery staple");
  if (next !== undefined) form.set("next", next);

  try {
    const result = await signIn(null, form);
    assert.fail(`expected a redirect, got ${JSON.stringify(result)}`);
  } catch (error) {
    const match = /^REDIRECT:(.*)$/.exec(error.message);
    assert.ok(match, `expected a redirect, got: ${error.message}`);
    return match[1];
  }
}

test("a reporting client's own report is honoured, query string and all", async () => {
  const next = `/reporting?workspace=${workspace}&month=2026-08`;
  assert.equal(await signInAs(CLIENT, CLIENT_EMAIL, next), next);
});

test("a reporting client is not sent to /no-access by a stale tab", async () => {
  // The exact URL Dom arrived on.
  assert.equal(await signInAs(CLIENT, CLIENT_EMAIL, "/no-access"), "/");
});

test("a reporting client is not sent to a members-only page", async () => {
  for (const next of ["/piazza", "/stations", "/log", "/you", "/admin/reporting"]) {
    assert.equal(
      await signInAs(CLIENT, CLIENT_EMAIL, next),
      "/",
      `${next} is behind a members row this login does not have`,
    );
  }
});

test("a member still goes where they asked", async () => {
  // The other way round: the fix must not start ignoring a real `next`.
  for (const next of ["/piazza", "/log", "/admin/reporting", "/reporting"]) {
    assert.equal(await signInAs(NINA, NINA_EMAIL, next), next);
  }
});

test("a member is not sent to /no-access either", async () => {
  assert.equal(await signInAs(NINA, NINA_EMAIL, "/no-access"), "/");
});

test("no next at all goes to the root, which decides", async () => {
  assert.equal(await signInAs(CLIENT, CLIENT_EMAIL, undefined), "/");
  assert.equal(await signInAs(NINA, NINA_EMAIL, undefined), "/");
});

test("an external next is still refused", async () => {
  assert.equal(await signInAs(NINA, NINA_EMAIL, "https://evil.test/"), "/");
  assert.equal(await signInAs(NINA, NINA_EMAIL, "//evil.test/"), "/");
});

test("a wrong password is reported, not redirected", async () => {
  configure(db, CLIENT);
  const form = new FormData();
  form.set("email", CLIENT_EMAIL);
  form.set("password", "");
  const result = await signIn(null, form);
  assert.match(result.error, /both your email and password/);
});

test("an unknown email gets the credentials message", async () => {
  configure(db, null);
  const form = new FormData();
  form.set("email", "nobody@nowhere.test");
  form.set("password", "whatever");
  const result = await signIn(null, form);
  assert.match(result.error, /don't match/);
});
