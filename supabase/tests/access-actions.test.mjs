/**
 * Getting a locked-out member back in, from their admin page.
 *
 * Both actions end in a call to the auth API rather than a row, so what's
 * asserted is who the call was about and who may make it: an admin only, for
 * a member only. An action that reset the wrong account, or let a member
 * reset an admin's, would look exactly like one that worked.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { authCalls, resetAuthCalls } from "./supabase-shim.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.test";

const { sendResetLink, setTemporaryPassword } = await import("../../src/lib/admin/access-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const DOM = "22222222-2222-2222-2222-222222222222";
const RUTH = "33333333-3333-3333-3333-333333333333";
const GONE = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${DOM}','dom@test'), ('${RUTH}','ruth@test'), ('${GONE}','gone@test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina','admin','active'),
    ('${DOM}','dom@test','Dom','admin','active');
`);
await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${RUTH}','ruth@test','Ruth Bell', now(), now())`);
  await db.query(`select public.create_member('${GONE}','gone@test','Gone Member', now(), now())`);
  await db.query(`select public.activate_member('${GONE}')`);
  await db.query(`select public.cancel_member('${GONE}', null)`);
});

const form = (memberId) => {
  const data = new FormData();
  data.append("member_id", memberId);
  return data;
};

test.beforeEach(() => resetAuthCalls());

test("a member cannot reset anyone's password", async () => {
  configure(db, RUTH);
  await assert.rejects(() => setTemporaryPassword(null, form(NINA)), /REDIRECT:\/piazza/);
  await assert.rejects(() => sendResetLink(null, form(NINA)), /REDIRECT:\/piazza/);
  assert.equal(authCalls().length, 0);
});

test("the reset link goes to the member's address and lands on choose-a-password", async () => {
  configure(db, NINA);
  const result = await sendResetLink(null, form(RUTH));

  assert.equal(result?.error, undefined);
  assert.match(result?.notice ?? "", /ruth@test/);
  assert.deepEqual(authCalls(), [
    { kind: "reset_link", email: "ruth@test", redirectTo: "https://aos.test/auth/confirm?next=/set-password" },
  ]);
});

test("a temporary password is set on that member and shown once", async () => {
  configure(db, NINA);
  const result = await setTemporaryPassword(null, form(RUTH));

  assert.equal(result?.error, undefined);
  assert.match(result?.notice ?? "", /Ruth Bell/);
  assert.equal(authCalls().length, 1);
  assert.equal(authCalls()[0].kind, "update_user");
  assert.equal(authCalls()[0].id, RUTH);
  const password = authCalls()[0].attributes.password;
  assert.equal(result?.password, password, "what Nina sees is what was set");
  // An invitation never opened leaves the email unconfirmed, and Supabase
  // refuses password sign-in for an unconfirmed email whatever the password.
  assert.equal(authCalls()[0].attributes.email_confirm, true, "confirms the email too");
  assert.match(password, /^[a-zA-Z0-9]{12}$/);
  assert.doesNotMatch(password, /[0OIl1]/, "nothing that can be misread over the phone");
});

test("two calls give two different passwords", async () => {
  configure(db, NINA);
  const a = (await setTemporaryPassword(null, form(RUTH)))?.password;
  const b = (await setTemporaryPassword(null, form(RUTH)))?.password;
  assert.notEqual(a, b);
});

test("an admin's account is refused — from both routes", async () => {
  configure(db, NINA);
  const set = await setTemporaryPassword(null, form(DOM));
  const link = await sendResetLink(null, form(DOM));
  assert.match(set?.error ?? "", /Admin accounts/);
  assert.match(link?.error ?? "", /Admin accounts/);
  assert.equal(authCalls().length, 0);
});

test("a cancelled member has no access to restore", async () => {
  configure(db, NINA);
  const result = await setTemporaryPassword(null, form(GONE));
  assert.match(result?.error ?? "", /cancelled/);
  assert.equal(authCalls().length, 0);
});

test("a made-up id is refused before anything is called", async () => {
  configure(db, NINA);
  const result = await setTemporaryPassword(null, form("99999999-9999-9999-9999-999999999999"));
  assert.match(result?.error ?? "", /No such member/);
  assert.equal(authCalls().length, 0);
});
