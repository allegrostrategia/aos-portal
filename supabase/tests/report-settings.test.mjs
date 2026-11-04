/**
 * What a member may change about their own report, and what a retainer
 * client may not (§8.1, §10.3).
 *
 * The screen only renders for somebody who can edit, so these drive the
 * actions directly — a refusal that only exists because a field is not
 * on screen is not a refusal.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveHiddenCategories, saveReportSettings } = await import(
  "../../src/lib/reporting/settings-actions.ts"
);

const NINA = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";

const db = await createTestDatabase();
await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${MEMBER}','ruth@member.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status) values
    ('${NINA}','nina@allegro.test','Nina Oliver','admin','active'),
    ('${MEMBER}','ruth@member.test','Ruth','member','active');
`);

const make = async (owner, kind, name) =>
  (await asMember(db, NINA, () => db.query(
    `select (public.create_report_workspace('${owner}','${kind}','${name}','${name}','2026-08-01','GBP',null)).id as id`,
  ))).rows[0].id;

const MINE = await make(MEMBER, "aos_member", "Ruth Coaching");
const THEIRS = await make(CLIENT, "retainer", "Northwind");

const as = (uid, fn) => { configure(db, uid); return fn(); };
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((one) => f.append(k, String(one)));
    else f.append(k, String(v));
  }
  return f;
};
const hiddenOf = async (id) =>
  (await asMember(db, NINA, () => db.query(
    `select coalesce(array_to_string(hidden_categories, ','), '') as hidden
       from public.report_workspaces where id = '${id}'`,
  ))).rows[0].hidden;

test("a member turns their own sections off", async () => {
  await assert.rejects(
    () => as(MEMBER, () => saveHiddenCategories(null, form({
      workspace_id: MINE, shown: ["financials", "leads_conversions"],
    }))),
    /NEXT_REDIRECT|redirect/i,
    "a save that worked redirects with ?saved=",
  );
  const hidden = await hiddenOf(MINE);
  // Only the sections that have actually shipped are in the list to
  // begin with, so this names one that is: Ads is Stage 3 and is not
  // offered here at all.
  assert.ok(hidden.includes("social_media"), "what was not shown is hidden");
  assert.ok(hidden.includes("offers"), "all of them, not just the first");
  assert.ok(!hidden.includes("financials"), "and what was shown is not");
});

test("a retainer client cannot, and is told so rather than quietly ignored", async () => {
  // `report_can_edit` is false for them by design — they view and
  // comment, Allegro enters. RLS answers it, so the update matches no
  // row at all; without the read-back that reads exactly like success.
  const before = await hiddenOf(THEIRS);
  const result = await as(CLIENT, () => saveHiddenCategories(null, form({
    workspace_id: THEIRS, shown: ["financials"],
  })));
  assert.match(result?.error ?? "", /isn't yours to change/i);
  assert.equal(await hiddenOf(THEIRS), before, "and nothing moved");
});

test("nor another member's report, which is not theirs either", async () => {
  const before = await hiddenOf(MINE);
  const result = await as(CLIENT, () => saveReportSettings(null, form({
    workspace_id: MINE, business_name: "Renamed by somebody else", currency: "GBP",
  })));
  assert.match(result?.error ?? "", /isn't yours to change|don't have access/i);
  assert.equal(await hiddenOf(MINE), before);
});

test("a report cannot be left with no sections at all", async () => {
  const result = await as(MEMBER, () => saveHiddenCategories(null, form({
    workspace_id: MINE,
  })));
  assert.match(result?.error ?? "", /at least one section/i);
});

/**
 * The offer behind potential revenue (Nina 3 Nov, as revised by Dom 4 Nov).
 *
 * The column holds a CHOICE, not a price — the price stays on the offer
 * so two screens cannot come to disagree about what a sale is worth.
 * Which makes "is that choice a real offer, and is it theirs" a database
 * question: the action posts whatever the form posts, and the form is
 * not the only way in.
 */
const entity = async (workspace, type, name, price = null) =>
  (await asMember(db, NINA, () => db.query(
    `insert into public.report_entities (workspace_id, entity_type, name, price)
     values ('${workspace}', '${type}', '${name}', ${price === null ? "null" : price})
     returning id`,
  ))).rows[0].id;

const MY_OFFER = await entity(MINE, "offer", "Signature programme", 500);
const MY_FUNNEL = await entity(MINE, "funnel", "Webinar funnel");
const THEIR_OFFER = await entity(THEIRS, "offer", "Northwind retainer", 2000);

const chosenOf = async (id) =>
  (await db.query(
    `select coalesce(potential_revenue_offer_id::text, '') as chosen
       from public.report_workspaces where id = '${id}'`,
  )).rows[0].chosen;

const settings = (extra) =>
  form({ workspace_id: MINE, business_name: "Ruth Coaching", currency: "GBP", ...extra });

test("a member picks one of their own offers, and the choice sticks", async () => {
  await assert.rejects(
    () => as(MEMBER, () => saveReportSettings(null, settings({
      potential_revenue_offer_id: MY_OFFER,
    }))),
    /NEXT_REDIRECT|redirect/i,
  );
  assert.equal(await chosenOf(MINE), MY_OFFER);

  // And blank clears it, which is what takes the figure off the page.
  await assert.rejects(
    () => as(MEMBER, () => saveReportSettings(null, settings({
      potential_revenue_offer_id: "",
    }))),
    /NEXT_REDIRECT|redirect/i,
  );
  assert.equal(await chosenOf(MINE), "");
});

test("but not another business's offer, whatever the form posts", async () => {
  const result = await as(MEMBER, () => saveReportSettings(null, settings({
    potential_revenue_offer_id: THEIR_OFFER,
  })));
  assert.match(result?.error ?? "", /own offer/i);
  assert.equal(await chosenOf(MINE), "", "and nothing was set");
});

test("nor a funnel, which has no price to multiply by", async () => {
  const result = await as(MEMBER, () => saveReportSettings(null, settings({
    potential_revenue_offer_id: MY_FUNNEL,
  })));
  assert.match(result?.error ?? "", /can only be based on an offer/i);
  assert.equal(await chosenOf(MINE), "");
});
