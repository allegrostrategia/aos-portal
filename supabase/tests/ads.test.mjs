/**
 * Ads (§5.7), through the real actions and the real policies.
 *
 * The rule the whole category turns on: **cost per lead counts lead- and
 * sales-goal campaigns only**, and a campaign nobody has given a goal is
 * left out of it rather than counted by default (Nina via Dom, 5 Oct).
 * On the §10.2 sample that is the difference between £6.00 and £4.50 —
 * and a campaign quietly counted would move the headline figure according
 * to a decision nobody made.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveCampaign, retireCampaign, saveCampaignMonth } = await import(
  "../../src/lib/reporting/campaign-actions.ts"
);
const { resolveReportContext } = await import("../../src/lib/reporting/context.ts");
const { getMonthFigures } = await import("../../src/lib/reporting/month-figures.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const AUG = "2026-08-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${AUG}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);
});

const as = (uid, fn) => {
  configure(db, uid);
  return fn();
};
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};
const rows = async (uid, sql) => (await asMember(db, uid, () => db.query(sql))).rows;

async function addCampaign(name, goal) {
  const result = await as(NINA, () =>
    saveCampaign(null, form({ workspace_id: WS, name, campaign_goal: goal ?? "" })),
  );
  assert.equal(result?.error, undefined, result?.error);
  const [row] = await rows(NINA, `
    select id from public.report_entities
     where workspace_id = '${WS}' and entity_type = 'ad_campaign' and name = '${name}'`);
  return row.id;
}

const figuresFor = async (uid, month = "2026-08") => {
  configure(db, uid);
  const ctx = await resolveReportContext({ workspace: WS, month }, "2026-09-02");
  return getMonthFigures(ctx);
};

// The §10.2 sample, invented figures and all: £600 over 100 leads is
// £6.00 blended; £450 on the three lead campaigns is £4.50.
let leadForm;
let optIn;
let retarget;
let visitsA;
let visitsB;

test("campaigns are set up with a goal, or honestly without one", async () => {
  leadForm = await addCampaign("Lead form", "leads");
  optIn = await addCampaign("Workshop opt-in", "leads");
  retarget = await addCampaign("Retargeting sales", "sales");
  visitsA = await addCampaign("Profile visits A", "profile_visits");
  visitsB = await addCampaign("Profile visits B", null);

  const stored = await rows(NINA, `
    select name, campaign_goal::text g from public.report_entities
     where workspace_id = '${WS}' and entity_type = 'ad_campaign' order by name`);

  assert.deepEqual(
    stored.map((r) => [r.name, r.g]),
    [
      ["Lead form", "leads"],
      ["Profile visits A", "profile_visits"],
      ["Profile visits B", null],
      ["Retargeting sales", "sales"],
      ["Workshop opt-in", "leads"],
    ],
    "no goal is stored as no goal, not guessed at",
  );
});

test("a goal that is not one of the five is refused", async () => {
  const result = await as(NINA, () =>
    saveCampaign(null, form({ workspace_id: WS, name: "Nonsense", campaign_goal: "vibes" })),
  );
  assert.match(result?.error ?? "", /not one of the campaign goals/);
});

test("the month's figures save per campaign, not merged into one", async () => {
  const result = await as(NINA, () =>
    saveCampaignMonth(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        [`v:ads_spend:${leadForm}`]: 250,
        [`v:ads_leads:${leadForm}`]: 60,
        [`v:ads_link_clicks:${leadForm}`]: 2000,
        [`v:ads_impressions:${leadForm}`]: 30000,
        [`v:ads_spend:${optIn}`]: 150,
        [`v:ads_leads:${optIn}`]: 40,
        [`v:ads_link_clicks:${optIn}`]: 1500,
        [`v:ads_impressions:${optIn}`]: 20000,
        [`v:ads_spend:${retarget}`]: 50,
        [`v:ads_link_clicks:${retarget}`]: 400,
        [`v:ads_impressions:${retarget}`]: 5000,
        [`v:ads_spend:${visitsA}`]: 100,
        [`v:ads_impressions:${visitsA}`]: 3000,
        [`v:ads_spend:${visitsB}`]: 50,
        [`v:ads_impressions:${visitsB}`]: 2000,
        [`v:ads_link_clicks:${visitsB}`]: 300,
      }),
    ),
  );
  assert.equal(result?.error, undefined, result?.error);

  const stored = await rows(NINA, `
    select count(*)::int c from public.report_values
     where workspace_id = '${WS}' and metric_key = 'ads_spend' and entity_id is not null`);
  assert.equal(stored[0].c, 5, "one spend row per campaign");
});

test("cost per lead counts lead and sales campaigns only", async () => {
  const figures = await figuresFor(NINA);

  // Blended would be 600 ÷ 100 = 6.00. The headline is 450 ÷ 100 = 4.50.
  assert.equal(figures.figure("ads_cost_per_lead"), 4.5);
  assert.notEqual(figures.figure("ads_cost_per_lead"), 6, "the blended figure is not the headline");
});

test("a campaign with no goal is not counted, and is not an error either", async () => {
  const before = (await figuresFor(NINA)).figure("ads_cost_per_lead");

  // Give the goalless campaign a lead goal, and the figure must move:
  // £500 over 100 leads is £5.00. That it moves is the proof it was
  // genuinely excluded before, rather than happening to agree.
  await as(NINA, () =>
    saveCampaign(
      null,
      form({ workspace_id: WS, campaign_id: visitsB, name: "Profile visits B", campaign_goal: "leads" }),
    ),
  );
  const after = (await figuresFor(NINA)).figure("ads_cost_per_lead");

  assert.equal(before, 4.5);
  assert.equal(after, 5, "£450 + £50 over 100 leads");

  // Put it back.
  await as(NINA, () =>
    saveCampaign(
      null,
      form({ workspace_id: WS, campaign_id: visitsB, name: "Profile visits B", campaign_goal: "" }),
    ),
  );
  assert.equal((await figuresFor(NINA)).figure("ads_cost_per_lead"), 4.5);
});

test("the other account-level figures are sums across campaigns", async () => {
  const figures = await figuresFor(NINA);

  // 600 ÷ 60,000 × 1,000 = 10.00; 4,200 ÷ 60,000 = 7%; 600 ÷ 4,200 = 0.14.
  assert.equal(figures.figure("ads_cpm"), 10);
  assert.equal(Number(figures.figure("ads_ctr").toFixed(2)), 7);
  assert.equal(Number(figures.figure("ads_cpc").toFixed(2)), 0.14);
});

test("leads from ads reach the Leads page without being typed twice", async () => {
  const figures = await figuresFor(NINA);
  assert.equal(
    figures.figure("leads_conversions_new_leads_from_ads"),
    100,
    "§4: entered once, used everywhere",
  );
});

test("an assigned team member can run all of it; the client can run none", async () => {
  const elize = await as(ELIZE, () =>
    saveCampaign(null, form({ workspace_id: WS, name: "Elize's campaign", campaign_goal: "traffic" })),
  );
  assert.equal(elize?.error, undefined, elize?.error);

  for (const [what, run] of [
    ["set one up", () => saveCampaign(null, form({ workspace_id: WS, name: "Mine", campaign_goal: "leads" }))],
    ["enter figures", () => saveCampaignMonth(null, form({ workspace_id: WS, month: AUG, [`v:ads_spend:${leadForm}`]: 1 }))],
    ["retire one", () => retireCampaign(null, form({ workspace_id: WS, campaign_id: leadForm }))],
  ]) {
    const refused = await as(CLIENT, run);
    assert.match(refused?.error ?? "", /filled in by your strategist/, `the client cannot ${what}`);
  }

  const [spend] = await rows(NINA, `
    select value::float v from public.report_values
     where workspace_id = '${WS}' and metric_key = 'ads_spend' and entity_id = '${leadForm}'`);
  assert.equal(spend.v, 250, "and nothing of theirs was written");
});

test("retiring a campaign keeps its figures and takes it off the list", async () => {
  await as(NINA, () =>
    retireCampaign(null, form({ workspace_id: WS, campaign_id: visitsA })),
  );

  const [row] = await rows(NINA, `
    select active, (select count(*)::int from public.report_values
                     where entity_id = '${visitsA}') as figures
      from public.report_entities where id = '${visitsA}'`);
  assert.equal(row.active, false);
  assert.ok(Number(row.figures) > 0, "rule 7: its past months are untouched");
});

test("a draft month gives the client the campaign names but none of the figures", async () => {
  // Deliberate, and documented on the policy: entities are setup, not
  // monthly figures, so they carry no publish gate — a client seeing the
  // list of their own campaigns learns nothing about their own business
  // they did not know. The FIGURES are what must not leak, and the page
  // never renders the table anyway while the month is a draft.
  const draft = await figuresFor(CLIENT);
  assert.ok(draft.campaignRows.length > 0, "their own campaigns, which are theirs");
  assert.deepEqual(
    [...new Set(draft.campaignRows.map((row) => row.spend))],
    [null],
    "and not one figure from an unpublished month",
  );
  assert.equal(draft.figure("ads_cost_per_lead"), null);

  configure(db, CLIENT);
  const ctx = await resolveReportContext({ workspace: WS, month: "2026-08" }, "2026-09-02");
  assert.equal(ctx.monthPublished, false, "so the page says so instead of drawing a table");

  await asMember(db, NINA, () =>
    db.query(`
      insert into public.report_periods (workspace_id, month, published_at, published_by)
      values ('${WS}', '${AUG}', now(), '${NINA}')
      on conflict (workspace_id, month)
        do update set published_at = now(), published_by = '${NINA}'`),
  );

  const published = await figuresFor(CLIENT);
  assert.ok(published.campaignRows.length > 0);
  assert.equal(
    published.figure("ads_cost_per_lead"),
    (await figuresFor(NINA)).figure("ads_cost_per_lead"),
    "§9: the same figure for both of them",
  );
});

test("a field naming another workspace's campaign writes nothing", async () => {
  // The entity id arrives in the field name, so a crafted form could
  // otherwise attach this client's spend to somebody else's campaign.
  const OTHER_CLIENT = "44444444-4444-4444-4444-444444444444";
  await db.exec(
    `insert into auth.users (id, email) values ('${OTHER_CLIENT}','other@client.test')`,
  );
  let otherCampaign;
  await asMember(db, NINA, async () => {
    const other = (
      await db.query(`select (public.create_report_workspace(
        '${OTHER_CLIENT}', 'retainer', 'Somebody Else Ltd', 'Other', '${AUG}')).id as id`)
    ).rows[0].id;
    otherCampaign = (
      await db.query(`
        insert into public.report_entities (workspace_id, entity_type, name)
        values ('${other}', 'ad_campaign', 'Theirs') returning id`)
    ).rows[0].id;
  });

  const result = await as(NINA, () =>
    saveCampaignMonth(
      null,
      form({
        workspace_id: WS,
        month: AUG,
        [`v:ads_spend:${leadForm}`]: 250,
        [`v:ads_spend:${otherCampaign}`]: 9999,
      }),
    ),
  );
  assert.equal(result?.error, undefined, "the legitimate half still saves");

  const [theirs] = await rows(NINA, `
    select count(*)::int c from public.report_values where entity_id = '${otherCampaign}'`);
  assert.equal(theirs.c, 0, "nothing was written against another workspace's campaign");
});
