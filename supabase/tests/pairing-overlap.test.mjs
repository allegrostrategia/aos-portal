/**
 * The overlap message, driven through the member's own availability action
 * (brief of 21 Sep 2026: real dates, and both partners told the moment the
 * second one has picked).
 *
 * What this pins down is the moment and the once: nothing when the first
 * partner picks, both told when the second does, nothing again on a resubmit.
 * And the two channels — the email on the member's "Pairing" switch, the push
 * to every device regardless — since a message that went to the wrong person
 * or twice is exactly as quiet as one that worked.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { sent, reset as resetEmail } from "./stubs/email-send.mjs";
import { pushed, reset as resetPush } from "./stubs/web-push.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
process.env.VAPID_PRIVATE_KEY = "test-private";
process.env.VAPID_SUBJECT = "mailto:test@test";

const { saveAvailability } = await import("../../src/lib/pairing/actions.ts");
const { checkPairingOverlap } = await import("../../src/lib/pairing/overlap.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "33333333-3333-3333-3333-333333333333";
const OMAR = "44444444-4444-4444-4444-444444444444";
const IVY = "55555555-5555-5555-5555-555555555555";
const MONTH = "2026-11-01";
const PAIRING = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test'), ('${OMAR}','omar@test'), ('${IVY}','ivy@test');
  insert into public.members (id, email, full_name, role, status, is_coach) values
    ('${NINA}','nina@allegro.test','Nina','admin','active', true);
`);
await asMember(db, NINA, async () => {
  for (const [id, email, name] of [
    [RUTH, "ruth@test", "Ruth Bell"],
    [OMAR, "omar@test", "Omar Diaz"],
    [IVY, "ivy@test", "Ivy Chen"],
  ]) {
    await db.query(`select public.create_member('${id}','${email}','${name}', now(), now())`);
    await db.query(`select public.activate_member('${id}')`);
  }
});
await db.exec(`
  insert into public.pairings (id, pairing_month) values ('${PAIRING}', '${MONTH}');
  insert into public.pairing_participants (pairing_id, member_id, pairing_month) values
    ('${PAIRING}', '${RUTH}', '${MONTH}'), ('${PAIRING}', '${OMAR}', '${MONTH}');
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values
    ('${RUTH}','https://push/ruth-phone','k','a'),
    ('${RUTH}','https://push/ruth-laptop','k','a'),
    ('${OMAR}','https://push/omar','k','a'),
    ('${IVY}','https://push/ivy','k','a');
`);

function pick(month, slots) {
  const data = new FormData();
  data.append("pairing_month", month);
  for (const slot of slots) data.append("slots", slot);
  return data;
}

const checkedAt = async (id = PAIRING) =>
  (await db.query(`select overlap_checked_at::text t from public.pairings where id = '${id}'`)).rows[0].t;

test.beforeEach(() => {
  resetEmail();
  resetPush();
});

test("the first partner to pick hears nothing yet", async () => {
  configure(db, RUTH);
  const result = await saveAvailability(null, pick(MONTH, ["2026-11-03T14:00", "2026-11-05T09:00", "2026-11-03T14:00"]));
  await flushAfter();

  assert.match(result?.notice ?? "", /2 times picked/);
  assert.match(result?.notice ?? "", /once you've both picked/i);
  assert.equal(await checkedAt(), null);
  assert.equal(sent().length, 0);
  assert.equal(pushed().length, 0);
});

test("a slot the grid wouldn't offer is dropped, not saved", async () => {
  const row = await db.query(
    `select availability from public.pairing_availability where member_id = '${RUTH}' and pairing_month = '${MONTH}'`,
  );
  assert.deepEqual(row.rows[0].availability.slots, ["2026-11-03T14:00", "2026-11-05T09:00"]);

  configure(db, IVY);
  await saveAvailability(null, pick(MONTH, ["2026-11-07T14:00", "tue-pm", "2026-12-03T14:00", "2026-11-03T14:00"]));
  const ivy = await db.query(
    `select availability from public.pairing_availability where member_id = '${IVY}' and pairing_month = '${MONTH}'`,
  );
  // A Saturday, the old grid's key and next month all go; the real one stays.
  assert.deepEqual(ivy.rows[0].availability.slots, ["2026-11-03T14:00"]);
});

test("the second partner's pick tells them both, at once, by email and push", async () => {
  configure(db, OMAR);
  await saveAvailability(null, pick(MONTH, ["2026-11-03T14:00", "2026-11-10T11:00"]));
  await flushAfter();

  assert.ok(await checkedAt(), "the check is recorded on the pairing");

  assert.deepEqual(sent().map((m) => m.to).sort(), ["omar@test", "ruth@test"]);
  const ruth = sent().find((m) => m.to === "ruth@test");
  const omar = sent().find((m) => m.to === "omar@test");
  assert.match(ruth.subject, /You and Omar Diaz are both free at 2pm on Tuesday 3 November/);
  assert.match(ruth.text, /You and Omar Diaz are both free at 2pm on Tuesday 3 November — send them a message to confirm your call!/);
  assert.match(omar.text, /You and Ruth Bell are both free/);
  // The only shared slot is named; nothing invented about the rest.
  assert.doesNotMatch(ruth.text, /other time/);

  const endpoints = pushed().map((p) => p.endpoint).sort();
  assert.deepEqual(endpoints, ["https://push/omar", "https://push/ruth-laptop", "https://push/ruth-phone"]);
  assert.match(pushed().find((p) => p.endpoint === "https://push/omar").payload.body, /You and Ruth Bell are both free/);
  assert.equal(pushed()[0].payload.url, "/pairing");
});

test("a resubmit after that changes the picks but sends nothing again", async () => {
  const before = await checkedAt();
  configure(db, RUTH);
  await saveAvailability(null, pick(MONTH, ["2026-11-10T11:00"]));
  await flushAfter();

  assert.equal(await checkedAt(), before);
  assert.equal(sent().length, 0);
  assert.equal(pushed().length, 0);
});

test("the check itself reports what it did, and is safe to call again", async () => {
  configure(db, null);
  assert.equal(await checkPairingOverlap(PAIRING), "already");
  assert.equal(await checkPairingOverlap("cccccccc-cccc-cccc-cccc-cccccccccccc"), "missing");
});

// A second pairing, so the no-overlap wording and the email switch can be
// seen without unpicking the first.
await db.exec(`
  insert into public.pairings (id, pairing_month) values ('${OTHER}', '2026-12-01');
  insert into public.pairing_participants (pairing_id, member_id, pairing_month) values
    ('${OTHER}', '${RUTH}', '2026-12-01'), ('${OTHER}', '${IVY}', '2026-12-01');
  update public.members set notify_pairing = false where id = '${IVY}';
`);

test("with no time in common, both are told to work one out — and the email switch is honoured", async () => {
  configure(db, RUTH);
  await saveAvailability(null, pick("2026-12-01", ["2026-12-01T09:00"]));
  await flushAfter();
  assert.equal(await checkedAt(OTHER), null, "Ivy hasn't picked yet");

  configure(db, IVY);
  await saveAvailability(null, pick("2026-12-01", ["2026-12-02T09:00"]));
  await flushAfter();

  assert.ok(await checkedAt(OTHER));
  // Ivy turned pairing email off: Ruth's email arrives, Ivy's does not.
  assert.deepEqual(sent().map((m) => m.to), ["ruth@test"]);
  assert.match(
    sent()[0].text,
    /You and Ivy Chen haven't both picked a time slot that you're both free — message Ivy to work out a slot that works for you both\./,
  );
  // Push is not on that switch: Ivy's device still hears.
  assert.deepEqual(pushed().map((p) => p.endpoint).sort(), [
    "https://push/ivy", "https://push/ruth-laptop", "https://push/ruth-phone",
  ]);
  assert.match(pushed().find((p) => p.endpoint === "https://push/ivy").payload.body, /You and Ruth Bell haven't both picked/);
});

test("sitting the month out counts as a pick, so the partner isn't left waiting", async () => {
  const third = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  await db.exec(`
    insert into public.pairings (id, pairing_month) values ('${third}', '2027-01-01');
    insert into public.pairing_participants (pairing_id, member_id, pairing_month) values
      ('${third}', '${OMAR}', '2027-01-01'), ('${third}', '${IVY}', '2027-01-01');`);

  configure(db, OMAR);
  await saveAvailability(null, pick("2027-01-01", ["2027-01-05T10:00"]));
  await flushAfter();
  configure(db, IVY);
  const result = await saveAvailability(null, pick("2027-01-01", []));
  await flushAfter();

  assert.match(result?.notice ?? "", /sitting this month out/);
  assert.ok(await checkedAt(third));
  assert.match(sent().find((m) => m.to === "omar@test").text, /haven't both picked a time slot/);
});
