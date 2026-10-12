import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { buildCampaignPreview } from "./campaign-preview.ts";
import { readMetaAds } from "./meta-ads.ts";

const fixture = readFileSync(new URL("./fixtures/meta-ads.csv", import.meta.url), "utf8");
const SEPTEMBER = "2026-09-01";
const labels = { ads_spend: "Spend", ads_impressions: "Impressions", ads_leads: "Leads" };

const campaignsFrom = () =>
  readMetaAds(fixture, SEPTEMBER, { "autumn workshop opt in": "leads" }).campaigns;

test("the file gives one set of figures per campaign that spent", () => {
  const campaigns = campaignsFrom();
  assert.deepEqual(campaigns.map((c) => c.name), [
    "Leads — broad, UK",
    "Leads — lookalike",
    "Workshop opt-in",
    "Profile visits, reels",
    "Profile visits brand",
  ]);
  // Per campaign, not the account total: the first one's own spend.
  assert.equal(campaigns[0].figures.ads_spend, 200);
  assert.equal(campaigns[0].figures.ads_leads, 35);
  // And the opt-in campaign's leads come from the mapped column.
  assert.equal(campaigns[2].figures.ads_leads, 40);
});

test("a campaign the file has and the screen does not is offered, not created", () => {
  const preview = buildCampaignPreview(campaignsFrom(), [], {}, labels);
  assert.equal(preview.matched.length, 0);
  assert.equal(preview.unmatched.length, 5, "all five are new");
  assert.equal(preview.unmatched[0].name, "Leads — broad, UK");
  assert.equal(preview.unmatched[0].figures.ads_spend, 200);
  // The goal comes across too, so a ticked campaign is set up right.
  assert.equal(preview.unmatched[0].goalIsLeads, true);
  assert.equal(preview.unmatched[3].goalIsLeads, false, "profile visits is not a lead goal");
});

test("an existing campaign is matched by exact name, and shows old → new", () => {
  const existing = [{ id: "a", name: "Leads — broad, UK" }];
  const preview = buildCampaignPreview(
    campaignsFrom(),
    existing,
    { "ads_spend|a": 150, "ads_impressions|a": 20000 },
    labels,
  );

  assert.equal(preview.matched.length, 1);
  assert.equal(preview.matched[0].entityId, "a");
  assert.deepEqual(preview.matched[0].changed, [
    { key: "ads_spend", label: "Spend", status: "changed", from: 150, to: 200 },
  ]);
  // The one that already matches is not called a change.
  assert.ok(preview.matched[0].rows.some((r) => r.key === "ads_impressions" && r.status === "same"));
  assert.equal(preview.unmatched.length, 4);
});

test("exact means exact, apart from whitespace at either end", () => {
  // Trimmed both sides, because a space at the end is an artefact of an
  // export and is invisible on screen — refusing on it would be
  // refusing on something nobody can see. Everything else stays strict:
  // a renamed campaign is a new one (Dom, 12 Oct).
  const matches = (name: string) =>
    buildCampaignPreview(campaignsFrom(), [{ id: "a", name }], {}, labels).matched.length === 1;

  assert.ok(matches("Leads — broad, UK"), "the name itself");

  // Trimmed on the FILE's side too — an export can carry a trailing
  // space just as easily as a hand-typed name can.
  const spacedInFile = [
    { name: "  Leads — broad, UK ", figures: { ads_spend: 200 }, goalIsLeads: true },
  ];
  assert.equal(
    buildCampaignPreview(spacedInFile, [{ id: "a", name: "Leads — broad, UK" }], {}, labels)
      .matched.length,
    1,
    "a space in the file is not a different campaign",
  );
  assert.ok(matches("  Leads — broad, UK  "), "spaces at both ends");
  assert.ok(matches("Leads — broad, UK\t"), "and a tab");

  assert.ok(!matches("leads — broad, uk"), "case counts");
  assert.ok(!matches("Leads - broad, UK"), "a hyphen is not an em dash");
  assert.ok(!matches("Leads — broad UK"), "the comma counts");
  assert.ok(!matches("Leads—broad, UK"), "the spaces inside count");
});

test("a campaign on screen the file is silent about is named, not emptied", () => {
  // It keeps whatever is in its boxes. Somebody who expected the file to
  // be the whole month should be told which ones it did not mention.
  const preview = buildCampaignPreview(
    campaignsFrom(),
    [
      { id: "a", name: "Leads — broad, UK" },
      { id: "z", name: "An older campaign" },
    ],
    {},
    labels,
  );
  assert.deepEqual(preview.untouched, ["An older campaign"]);
  assert.ok(!preview.matched.some((m) => m.entityId === "z"));
});

test("a column the file does not have is not a zero for every campaign", () => {
  // §4's rule, per row: the sample has no purchases column at all.
  const campaigns = campaignsFrom();
  for (const campaign of campaigns) {
    assert.ok(!("ads_purchases" in campaign.figures), `${campaign.name} has no purchases`);
    assert.ok(!("ads_revenue_from_ads" in campaign.figures));
  }
});

test("reach is not filled per campaign either", () => {
  for (const campaign of campaignsFrom()) {
    assert.ok(!("ads_reach" in campaign.figures), `${campaign.name}`);
  }
});
