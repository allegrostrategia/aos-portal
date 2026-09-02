/**
 * Chat, driven through the app's own Server Actions.
 *
 * Same approach as the other action suites: the actions run unmodified, only
 * their surroundings are stubbed, and every query still goes through RLS as a
 * real signed-in member.
 *
 * The two worth the most here are the ones that protect people rather than data
 * — a message can't claim somebody else's audio, and consent can't be given for
 * anything other than a specific build.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "..", "src");
const stub = (file) => pathToFileURL(path.join(HERE, "stubs", file)).href;

const SUBSTITUTES = new Map([
  ["server-only", stub("server-only.mjs")],
  ["next/cache", stub("next-cache.mjs")],
  ["next/navigation", stub("next-navigation.mjs")],
  ["@/lib/supabase/server", stub("supabase-server.mjs")],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const substitute = SUBSTITUTES.get(specifier);
    if (substitute) return { url: substitute, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const base = path.join(SRC, specifier.slice(2));
      const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
        .find((c) => existsSync(c));
      if (!found) throw new Error(`Test hook cannot resolve ${specifier}`);
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { sendMessage } = await import("../../src/lib/chat/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const RUTH = "22222222-2222-2222-2222-222222222222";
const OMAR = "33333333-3333-3333-3333-333333333333";
const BUILD = "44444444-4444-4444-4444-444444444444";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${RUTH}','ruth@test'), ('${OMAR}','omar@test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina','admin','active');
`);

await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${RUTH}','ruth@test','Ruth Bell', now(), now())`);
  await db.query(`select public.create_member('${OMAR}','omar@test','Omar Diaz', now(), now())`);
  await db.query(`select public.activate_member('${RUTH}')`);
  await db.query(`select public.activate_member('${OMAR}')`);
  await db.query(`
    insert into public.handover_pack (id, member_id, title, source)
    values ('${BUILD}','${RUTH}','Enquiry follow-up','hot_seat')`);
});

const GENERAL = (await db.query(
  `select id from public.chat_channels where slug='general'`,
)).rows[0].id;

function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const messages = async (where = "true") =>
  (await db.query(`select * from public.chat_messages where ${where} order by created_at`)).rows;

test("a member posts text to an open channel", async () => {
  configure(db, RUTH);
  const result = await sendMessage(null, form({ channel_id: GENERAL, body: "Morning" }));

  assert.equal(result, null);
  const rows = await messages(`body = 'Morning'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].member_id, RUTH);
});

test("an empty message is refused before it reaches the database", async () => {
  configure(db, RUTH);
  const result = await sendMessage(null, form({ channel_id: GENERAL, body: "   " }));
  assert.match(result?.error ?? "", /Say something first/);
});

// The forgery guard: voice_path arrives from the browser and ends up in a row
// other people read, so a message must not be able to claim someone else's audio.
test("a message cannot claim another member's recording", async () => {
  configure(db, RUTH);
  const result = await sendMessage(
    null,
    form({
      channel_id: GENERAL,
      voice_path: `${OMAR}/stolen.webm`,
      voice_seconds: "12",
    }),
  );

  assert.match(result?.error ?? "", /isn't yours to send/);
  assert.equal((await messages(`voice_path is not null`)).length, 0);
});

test("a member's own recording sends, with its duration", async () => {
  configure(db, RUTH);
  const result = await sendMessage(
    null,
    form({ channel_id: GENERAL, voice_path: `${RUTH}/note.webm`, voice_seconds: "12" }),
  );

  assert.equal(result, null);
  const rows = await messages(`voice_path = '${RUTH}/note.webm'`);
  assert.equal(rows[0].voice_seconds, 12);
  assert.equal(rows[0].body, null);
});

test("a recording with no usable duration is refused, not stored half-formed", async () => {
  configure(db, RUTH);
  const result = await sendMessage(
    null,
    form({ channel_id: GENERAL, voice_path: `${RUTH}/broken.webm`, voice_seconds: "0" }),
  );

  assert.match(result?.error ?? "", /didn't come through/);
  assert.equal((await messages(`voice_path = '${RUTH}/broken.webm'`)).length, 0);
});

test("consent without a build is refused in words, not by a constraint error", async () => {
  configure(db, RUTH);
  const result = await sendMessage(
    null,
    form({ channel_id: GENERAL, body: "Reuse this", testimonial_consent: "on" }),
  );

  assert.match(result?.error ?? "", /specific build/);
  assert.doesNotMatch(result?.error ?? "", /constraint|violates|SQLSTATE/i);
});

test("consent on an update about a build is recorded", async () => {
  configure(db, RUTH);
  const result = await sendMessage(
    null,
    form({
      channel_id: GENERAL,
      body: "Two weeks in, still holding",
      handover_pack_id: BUILD,
      testimonial_consent: "on",
    }),
  );

  assert.equal(result, null);
  const rows = await messages(`handover_pack_id = '${BUILD}'`);
  assert.equal(rows[0].testimonial_consent, true);
});

test("an update about a build defaults to no consent when the box is left alone", async () => {
  configure(db, RUTH);
  await sendMessage(
    null,
    form({ channel_id: GENERAL, body: "Second update", handover_pack_id: BUILD }),
  );

  const rows = await messages(`body = 'Second update'`);
  assert.equal(rows[0].testimonial_consent, false);
});

test("a member cannot post into a direct channel they are not in", async () => {
  const dm = (await asMember(db, NINA, () =>
    db.query(`select public.open_direct_channel('${RUTH}') id`),
  )).rows[0].id;

  configure(db, OMAR);
  const result = await sendMessage(null, form({ channel_id: dm, body: "Butting in" }));

  assert.match(result?.error ?? "", /Couldn't send/);
  assert.equal((await messages(`body = 'Butting in'`)).length, 0);
});
