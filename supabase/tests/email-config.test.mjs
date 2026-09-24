/**
 * The environment fingerprint.
 *
 * It exists because a deployment said a variable was missing that a dashboard
 * said was present, and it goes into a database column and a server log — so
 * the test that matters is that it never carries a value out with it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";

const SECRET = "re_a_real_looking_secret_value_9876";
const SERVICE = "s".repeat(219);

process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
process.env.VERCEL_ENV = "production";
process.env.VERCEL_URL = "aos-portal-abc123.vercel.app";
// The near-miss the dashboard can't show you: a trailing space in the NAME.
process.env["RESEND_API_KEY "] = SECRET;
delete process.env.RESEND_API_KEY;

const { envFingerprint, isEmailConfigured, sendEmail } = await import("../../src/lib/email/send.ts");

test("it never carries a secret value out with it", () => {
  const out = envFingerprint();
  assert.ok(!out.includes(SECRET), "a value escaped into the fingerprint");
  assert.ok(!out.includes(SERVICE), "a value escaped into the fingerprint");
});

test("it names a variable whose name is padded, which a dashboard hides", () => {
  assert.match(envFingerprint(), /"RESEND_API_KEY "/);
});

test("it distinguishes absent from present, by length", () => {
  const out = envFingerprint();
  assert.match(out, /RESEND_API_KEY=absent/);
  assert.match(out, /SUPABASE_SERVICE_ROLE_KEY=219 chars/);
});

test("it says which deployment is speaking", () => {
  assert.match(envFingerprint(), /VERCEL_ENV=production/);
  assert.match(envFingerprint(), /VERCEL_URL=aos-portal-abc123\.vercel\.app/);
});

test("a send with no key explains itself with the fingerprint attached", async () => {
  assert.equal(isEmailConfigured(), false);
  const result = await sendEmail({ to: "ruth@test", subject: "x", text: "y" });
  assert.equal(result.ok, false);
  assert.match(result.error, /RESEND_API_KEY isn't set on this deployment/);
  assert.match(result.error, /What this runtime sees:/);
  assert.ok(!result.error.includes(SECRET));
});
