/**
 * Who gets a push, and who doesn't.
 *
 * The sender runs with the service role and decides recipients from the room,
 * the member's push switches and their status. This drives it against PGlite
 * with web-push stubbed, and asserts on the outbox — the half that no schema
 * test reaches. Real delivery to a real phone is the separate, careful pass
 * the brief describes; this is the logic in front of it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { pushed, reset, failEndpointsWith } from "./stubs/web-push.mjs";

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
process.env.VAPID_PRIVATE_KEY = "test-private";
process.env.VAPID_SUBJECT = "mailto:test@test";

const { pushForMessage, pushForReaction } = await import("../../src/lib/push/send.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const OMAR = "33333333-3333-3333-3333-333333333333";
const GONE = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();
configure(db, null);

// Nina (admin), Ruth and Omar (active), Gone (cancelled). Nobody is inserted
// into chat_participants for #general, because production never does that: a
// group room is everyone with portal access, and only direct channels have
// participant rows. The first version of this file inserted them, and the
// sender's group path passed for a reason that wasn't true anywhere real.
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@test'), ('${RUTH}','ruth@test'), ('${OMAR}','omar@test'), ('${GONE}','gone@test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@test','Nina Coach','admin','active'),
    ('${RUTH}','ruth@test','Ruth Ellis','member','active'),
    ('${OMAR}','omar@test','Omar Diaz','member','active'),
    ('${GONE}','gone@test','Gone Member','member','cancelled');
`);
const general = (await db.query(`select id from public.chat_channels where slug='general'`)).rows[0].id;
await db.exec(`
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values
    ('${NINA}','https://push/nina','k','a'),
    ('${RUTH}','https://push/ruth-phone','k','a'),
    ('${RUTH}','https://push/ruth-laptop','k','a'),
    ('${OMAR}','https://push/omar','k','a'),
    ('${GONE}','https://push/gone','k','a');
`);

const say = async (who, body) => (await db.query(
  `insert into public.chat_messages (channel_id, member_id, body) values ('${general}','${who}','${body}') returning id`,
)).rows[0].id;

test("a message goes to everyone else in the room, every device, not the sender", async () => {
  reset();
  const id = await say(RUTH, "Morning all");
  const sent = await pushForMessage(id);

  const endpoints = pushed().map((p) => p.endpoint).sort();
  assert.deepEqual(endpoints, ["https://push/nina", "https://push/omar"]);
  assert.equal(sent, 2);
  assert.match(pushed()[0].payload.title, /Ruth/);
  assert.equal(pushed()[0].payload.body, "Morning all");
  assert.equal(pushed()[0].payload.url, "/sociale/general");
});

test("a cancelled member in the room is not pushed", async () => {
  reset();
  await pushForMessage(await say(OMAR, "Anyone about?"));
  assert.ok(!pushed().some((p) => p.endpoint === "https://push/gone"));
});

test("push_chat off means no push, whatever the room", async () => {
  reset();
  await db.query(`update public.members set push_chat = false where id='${NINA}'`);
  await pushForMessage(await say(OMAR, "Quiet one"));
  assert.ok(!pushed().some((p) => p.endpoint === "https://push/nina"));
  await db.query(`update public.members set push_chat = true where id='${NINA}'`);
});

test("a dead device is marked expired and never tried again", async () => {
  reset();
  failEndpointsWith("https://push/omar", 410);
  await pushForMessage(await say(RUTH, "Still here?"));
  const row = (await db.query(
    `select expired_at is not null e from public.push_subscriptions where endpoint='https://push/omar'`,
  )).rows[0];
  assert.equal(row.e, true);

  reset();
  await pushForMessage(await say(RUTH, "And again"));
  assert.ok(!pushed().some((p) => p.endpoint === "https://push/omar"));
});

test("a reaction pushes the author only when they've asked for it, never for their own", async () => {
  reset();
  const id = await say(RUTH, "Shipped it");
  await pushForReaction(id, OMAR, "👏");
  assert.equal(pushed().length, 0, "off by default");

  await db.query(`update public.members set push_reactions = true where id='${RUTH}'`);
  await pushForReaction(id, RUTH, "❤️");
  assert.equal(pushed().length, 0, "your own reaction is not news");

  await pushForReaction(id, OMAR, "👏");
  const to = pushed().map((p) => p.endpoint).sort();
  assert.deepEqual(to, ["https://push/ruth-laptop", "https://push/ruth-phone"]);
  assert.match(pushed()[0].payload.title, /Omar reacted 👏/);
});

test("a direct message goes to the other participant only, not the whole membership", async () => {
  reset();
  // Nina, not Omar: Omar's device was marked expired by the test above.
  const direct = (await db.query(
    `select public.ensure_direct_channel('${RUTH}','${NINA}') id`,
  )).rows[0].id;
  const id = (await db.query(
    `insert into public.chat_messages (channel_id, member_id, body) values ('${direct}','${RUTH}','just you') returning id`,
  )).rows[0].id;
  await pushForMessage(id);
  assert.deepEqual(pushed().map((p) => p.endpoint), ["https://push/nina"]);
  assert.equal(pushed()[0].payload.url, `/sociale/${direct}`);
});

test("without VAPID keys nothing is sent and nothing throws", async () => {
  reset();
  const saved = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  const sent = await pushForMessage(await say(RUTH, "Unconfigured"));
  process.env.VAPID_PRIVATE_KEY = saved;
  assert.equal(sent, 0);
  assert.equal(pushed().length, 0);
});
