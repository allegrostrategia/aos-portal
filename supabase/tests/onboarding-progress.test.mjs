/**
 * The onboarding path's logic (round 4, item 6), driven through the real
 * query against real rows: order, what unlocks what, and that the roadmap
 * step is derived from a published roadmap and nothing else.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { getOnboardingProgress } = await import("../../src/lib/onboarding/progress.ts");
const { setOnboardingStep } = await import("../../src/lib/onboarding/actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const IVY = "22222222-2222-2222-2222-222222222222";
const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values ('${NINA}','nina@t'), ('${IVY}','ivy@t');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@t','Nina','admin','active');
`);
await asMember(db, NINA, async () => {
  await db.query(`select public.create_member('${IVY}','ivy@t','Ivy Lane', now(), now())`);
});
const ivy = async () => (await db.query(`select * from public.members where id='${IVY}'`)).rows[0];
const keys = (p) => p.steps.map((s) => s.key);
const step = (p, key) => p.steps.find((s) => s.key === key);
function form(fields) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

test("the order: video, form, tracking, call, roadmap, hot seat", async () => {
  configure(db, IVY);
  const p = await getOnboardingProgress(await ivy());
  assert.deepEqual(keys(p), ["video", "form", "tracking", "call", "roadmap", "hot_seat"]);
  assert.equal(p.completeCount, 0);
  assert.equal(p.next?.key, "video");
});

test("the call is locked by the form, and the hot seat by the roadmap", async () => {
  configure(db, IVY);
  const p = await getOnboardingProgress(await ivy());
  assert.match(step(p, "call").locked, /form first/);
  assert.match(step(p, "hot_seat").locked, /roadmap arrives/);
  assert.equal(step(p, "form").locked, undefined);
  assert.equal(step(p, "tracking").locked, undefined);
});

test("the form unlocks the call without any tracking", async () => {
  configure(db, IVY);
  await asMember(db, IVY, () => db.query(
    `insert into public.member_audits (member_id, occasion, submitted_at) values ('${IVY}','onboarding', now())`));
  const p = await getOnboardingProgress(await ivy());
  assert.equal(step(p, "form").done, true);
  assert.equal(step(p, "tracking").done, false);
  assert.equal(step(p, "call").locked, undefined);
});

test("with the video and form done, next is tracking; the call is open but not next", async () => {
  configure(db, IVY);
  await setOnboardingStep(form({ step: "video", done: "true" }));
  const p = await getOnboardingProgress(await ivy());
  assert.equal(step(p, "video").done, true);
  // Form is done, tracking isn't; call is open; hot seat locked.
  assert.equal(p.next?.key, "tracking");
  assert.equal(step(p, "call").locked, undefined);
  assert.equal(p.completeCount, 2);
});

test("the roadmap step cannot be ticked; it arrives when Nina publishes one", async () => {
  configure(db, IVY);
  await setOnboardingStep(form({ step: "roadmap", done: "true" }));
  let p = await getOnboardingProgress(await ivy());
  assert.equal(step(p, "roadmap").done, false);
  assert.match(step(p, "hot_seat").locked, /roadmap/);

  await asMember(db, NINA, () => db.query(
    `insert into public.roadmap (member_id, phases, reason, drafted_by, is_current, confirmed_at)
     values ('${IVY}', '[]', 'onboarding', 'nina', true, now())`));
  p = await getOnboardingProgress(await ivy());
  assert.equal(step(p, "roadmap").done, true);
  assert.equal(step(p, "hot_seat").locked, undefined);
});

test("a draft roadmap does not count", async () => {
  configure(db, IVY);
  await asMember(db, NINA, () => db.query(`delete from public.roadmap where member_id='${IVY}'`));
  await asMember(db, NINA, () => db.query(
    `insert into public.roadmap (member_id, phases, reason, drafted_by, is_current)
     values ('${IVY}', '[]', 'onboarding', 'nina', true)`));
  const p = await getOnboardingProgress(await ivy());
  assert.equal(step(p, "roadmap").done, false);
});
