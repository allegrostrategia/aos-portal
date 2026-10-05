import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  ads,
  CALC_COVERAGE,
  PULLED_COVERAGE,
  PULLED_NOT_IMPLEMENTED,
  clientExperience,
  divide,
  email,
  financials,
  funnels,
  launch,
  leads,
  monthOnMonthChange,
  offers,
  percentage,
  social,
  trafficLight,
  trialReels,
  yearToDateRate,
  yearToDateTotal,
  type OfferMonth,
} from "./formulas.ts";

/**
 * Brief §11 stage 1: "Done when: every formula in this brief passes its
 * test", and §13: "Every formula in sections 5 and 6 gets a unit test using
 * the worked examples in this brief. Prove each test can fail. Test
 * divide-by-zero on every rate."
 *
 * Where the brief gives a worked figure it is used here verbatim and the
 * source is named. Where it does not, the arithmetic is checked against the
 * stated formula rather than against the mockups — two of which are wrong,
 * one recorded in §12 and one found while building this (see the engagement
 * rate test below).
 */

/** Rounded for comparison, since these are all real division. */
const near = (actual: number | null, expected: number, places = 2) => {
  assert.notEqual(actual, null, "expected a figure, got a dash");
  assert.equal(Number(actual!.toFixed(places)), expected);
};

// ---------------------------------------------------------------------------
test("a dash, never an error and never 0% — §4", () => {
  // The rule that makes the difference between "we don't know" and "it's
  // nothing". Every rate in the tool funnels through divide().
  assert.equal(divide(10, 0), null);
  assert.equal(divide(10, null), null);
  assert.equal(divide(null, 10), null);
  assert.equal(divide(10, undefined), null);
  assert.equal(percentage(5, 0), null);
  // And zero on top is a real answer, not a missing one.
  assert.equal(divide(0, 10), 0);
});

test("every rate in the tool survives a zero or empty bottom", () => {
  // Named one by one, because "we use a shared helper" is a claim about
  // today's code and this is a claim about the behaviour.
  const zeroBottom: [string, number | null][] = [
    ["engagement rate", social.engagementRate({ likesAndComments: 10, saves: 1, shares: 1, reach: 0 })],
    ["save rate", social.saveRate(10, 0)],
    ["share rate", social.shareRate(10, 0)],
    ["reach per post", social.reachPerPost(100, 0)],
    ["profile visit to follow", social.profileVisitToFollow(10, 0)],
    ["follower growth %", social.followerGrowthPercent(100, 0)],
    ["non-follower reach", social.nonFollowerReachPercent(0, 0)],
    ["average views per reel", trialReels.averageViewsPerReel(100, 0)],
    ["follows per 1k views", trialReels.followsPer1kViews(10, 0)],
    ["followers per hour", trialReels.followersPerHour(10, 0)],
    ["hours per buyer", trialReels.hoursPerBuyer(10, 0)],
    ["unsubscribe rate", email.unsubscribeRate(5, 0)],
    ["click to open rate", email.clickToOpenRate(2, 0)],
    ["revenue per subscriber", email.revenuePerSubscriber(100, 0)],
    ["opt-in rate", funnels.optInRate(10, 0)],
    ["sales page conversion", funnels.salesPageConversion(2, 0)],
    ["checkout completion", funnels.checkoutCompletion(2, 0)],
    ["overall conversion", funnels.overallConversion(2, 0)],
    ["revenue per visitor", funnels.revenuePerVisitor(100, 0)],
    ["order bump take rate", funnels.orderBumpTakeRate(1, 0)],
    ["upsell take rate", funnels.upsellTakeRate(1, 0)],
    ["call show-up rate", leads.callShowUpRate(5, 0)],
    ["close rate", leads.closeRate(1, 0)],
    ["lead to client rate", leads.leadToClientRate(1, 0)],
    ["CPM", ads.cpm(100, 0)],
    ["CTR", ads.ctr(10, 0)],
    ["CPC", ads.cpc(100, 0)],
    ["cost per lead", ads.costPerLead(100, 0)],
    ["cost per acquisition", ads.costPerAcquisition(100, 0)],
    ["ROAS", ads.roas(100, 0)],
    ["retention rate", clientExperience.retentionRate(0, 0)],
    ["churn rate", clientExperience.churnRate(1, 0)],
    ["upsell rate", clientExperience.upsellRate(1, 0)],
    ["issues per 10 clients", clientExperience.issuesPer10Clients(1, 0)],
    ["share of total revenue", offers.shareOfTotalRevenue(100, 0)],
    ["conversion by offer", offers.conversionByOffer(1, 0)],
    ["show-up rate", launch.showUpRate(10, 0)],
    ["day drop-off", launch.dayDropOff(10, 0)],
    ["pitch retention", launch.pitchRetention(10, 0)],
    ["% of sign-up goal", launch.percentOfSignUpGoal(10, 0)],
    ["average order value", launch.averageOrderValue(100, 0)],
    ["launch conversion rate", launch.conversionRate(10, 0)],
    ["reply rate", launch.replyRate(1, 0)],
    ["call to close rate", launch.callToCloseRate(1, 0)],
    ["cost per sign-up", launch.costPerSignUp(100, 0)],
    ["cost per sale", launch.costPerSale(100, 0)],
    ["launch ROAS", launch.roas(100, 0)],
    ["month on month change", monthOnMonthChange(10, 0)],
  ];

  for (const [name, value] of zeroBottom) {
    assert.equal(value, null, `${name} should be a dash when its bottom is zero`);
  }
});

// ---------------------------------------------------------------------------
test("5.2 social media", () => {
  assert.equal(social.netFollowerGrowth(26420, 24650), 1770);
  near(social.followerGrowthPercent(26420, 24650), 7.18);

  // Saves and shares ARE in the engagement rate, per §5.2's formula. The
  // approved mockup prints 6.9% for these same figures, which is likes and
  // comments alone (12,640 ÷ 184,500). The brief wins; the mockup is wrong,
  // the second of its arithmetic errors after §12's launch planner.
  near(
    social.engagementRate({
      likesAndComments: 12640, saves: 3120, shares: 1480, reach: 184500,
    }),
    9.34,
  );

  near(social.saveRate(3120, 184500), 1.69);
  near(social.shareRate(1480, 184500), 0.8);
  near(social.reachPerPost(184500, 22), 8386.36);
  near(social.profileVisitToFollow(1770, 8960), 19.75);

  // §5.2's own worked example, invented: 28,000 of 30,000 reached were not
  // followers.
  near(social.nonFollowerReachPercent(28000, 30000 - 28000), 93.33);
});

test("5.3 trial reels", () => {
  near(trialReels.averageViewsPerReel(120000, 8), 15000);
  near(trialReels.followsPer1kViews(240, 120000), 2);
  near(trialReels.profileVisitToFollowRate(240, 1200), 20);
  near(trialReels.followersPerHour(240, 16), 15);
  near(trialReels.hoursPerBuyer(16, 4), 4);

  // Buyers lag by weeks or months (§5.3), so hours with no buyer yet is a
  // dash rather than a division by zero.
  assert.equal(trialReels.hoursPerBuyer(16, 0), null);

  assert.match(
    trialReels.profileCheckNote(12, 20) ?? "",
    /visiting your profile but not following/,
  );
  assert.equal(trialReels.profileCheckNote(25, 20), null);
});

test("5.3 a hook in the top 3 twice is Proven", () => {
  const proven = trialReels.provenItems([
    { body: "The one mistake costing you clients", month: "2026-07-01" },
    { body: "The one mistake costing you clients", month: "2026-08-01" },
    { body: "Three tools I could not run without", month: "2026-08-01" },
  ]);
  assert.deepEqual(proven, ["the one mistake costing you clients"]);
});

test("5.3 the same hook twice in ONE month is not Proven", () => {
  // "Two or more months", not two or more appearances. A client who repeats
  // a hook inside a month has not proved it keeps working over time.
  assert.deepEqual(
    trialReels.provenItems([
      { body: "Same hook", month: "2026-08-01" },
      { body: "Same hook", month: "2026-08-01" },
    ]),
    [],
  );
});

test("5.4 email", () => {
  assert.equal(email.netListGrowth(8742, 8020), 722);
  // Against LAST month's list — the list they were actually sent to.
  near(email.unsubscribeRate(64, 8020), 0.8);
  near(email.clickToOpenRate(3.2, 42), 7.62);
  near(email.revenuePerSubscriber(2400, 8742), 0.27);
});

test("5.4 / 10.3 open and click rates from counts", () => {
  // HeyClients reports counts, not rates, so the entry page accepts either.
  const { openRate, clickRate } = email.ratesFromCounts({
    opens: 3490, clicks: 266, emailsSent: 8300,
  });
  near(openRate, 42.05);
  near(clickRate, 3.2);
});

test("5.5 funnels", () => {
  near(funnels.optInRate(320, 1000), 32);
  near(funnels.salesPageConversion(14, 280), 5);
  near(funnels.checkoutCompletion(14, 20), 70);
  near(funnels.overallConversion(14, 1000), 1.4);
  assert.equal(funnels.revenue(14, 2500), 35000);
  near(funnels.revenuePerVisitor(35000, 1000), 35);
  near(funnels.orderBumpTakeRate(7, 14), 50);
  near(funnels.upsellTakeRate(3, 14), 21.43);
});

test("5.6 leads and conversions", () => {
  const sources = { social: 120, email: 86, ads: 64, referral: 28, other: 14 };
  assert.equal(leads.total(sources), 312); // the mockup's Leads by source chart
  const split = leads.sourceSplit(sources);
  near(split.social, 38.46);
  near(split.other, 4.49);
  near(leads.callShowUpRate(34, 46), 73.91);
  near(leads.closeRate(14, 34), 41.18);
  near(leads.leadToClientRate(14, 312), 4.49);
});

test("5.7 ads", () => {
  // §10.2's sample totals. Invented figures, real shape — see the brief.
  near(ads.cpm(600, 60000), 10);
  near(ads.ctr(4200, 60000), 7);
  near(ads.cpc(600, 4200), 0.14);
  near(ads.roas(1500, 600), 2.5);
});

test("5.7 / 10.2 cost per lead ignores awareness spend", () => {
  // The worked case in §10.2, and the whole reason campaign_goal exists:
  // blended over all spend it is £6.00, but £150 went on two profile-visit
  // campaigns that were never meant to get leads.
  const campaigns = [
    { name: "Lead form", goal: "leads" as const, spend: 250 },
    { name: "Workshop opt-in", goal: "leads" as const, spend: 150 },
    { name: "Retargeting sales", goal: "sales" as const, spend: 50 },
    { name: "Profile visits A", goal: "profile_visits" as const, spend: 100 },
    { name: "Profile visits B", goal: "profile_visits" as const, spend: 50 },
  ];

  near(ads.leadGoalSpend(campaigns), 450);
  near(ads.costPerLead(600, 100), 6);
  near(ads.costPerLeadFromLeadCampaigns(campaigns, 100), 4.5);
});

test("5.8 client experience", () => {
  assert.equal(clientExperience.activeClientsAtEnd(40, 14, 6), 48);
  near(clientExperience.retentionRate(40, 6), 85);
  near(clientExperience.churnRate(6, 40), 15);
  near(clientExperience.upsellRate(8, 40), 20);
  near(clientExperience.issuesPer10Clients(6, 48), 1.25);
});

test("5.8 average client lifetime needs three months first", () => {
  // §5.8: "shown once 3 months of data exist."
  assert.equal(clientExperience.averageClientLifetime([10, 10]), null);
  // Mean churn 10% a month → ten months.
  near(clientExperience.averageClientLifetime([8, 10, 12]), 10);
  // A business that lost nobody has no finite lifetime to report.
  assert.equal(clientExperience.averageClientLifetime([0, 0, 0]), null);
});

// ---------------------------------------------------------------------------
const OFFER_SET: OfferMonth[] = [
  { name: "1:1 Coaching", hourlyCost: 60, unitsSold: 4, revenue: 10000, hoursSpent: 20 },
  { name: "Group Programme", hourlyCost: 60, pricingModel: "recurring", unitsSold: 22, revenue: 5500, hoursSpent: 28 },
  { name: "VIP Day", hourlyCost: 60, unitsSold: 3, revenue: 4500, hoursSpent: 18 },
  { name: "Done-with-you", hourlyCost: 60, unitsSold: 1, revenue: 4850, hoursSpent: 30, otherDirectCosts: 800 },
];

test("5.9 offers, per offer", () => {
  const dwy = OFFER_SET[3];
  // 30 hours × £60 + £800 of other direct costs.
  assert.equal(offers.deliveryCost(dwy), 2600);
  near(offers.margin(dwy), 46.39);
  // Effective hourly rate deducts other direct costs but NOT the labour cost
  // — it is what the client's own hour earned, not a profit per hour.
  near(offers.effectiveHourlyRate(dwy), 135);
  near(offers.shareOfTotalRevenue(4850, 24850), 19.52);
  near(offers.conversionByOffer(4, 1000), 0.4);
});

test("5.9 the summary cards weight by size, not by offer", () => {
  assert.equal(offers.totalRevenue(OFFER_SET), 24850);
  assert.equal(offers.totalHours(OFFER_SET), 96);

  // Total delivery cost: (20+28+18+30) × 60 = 5,760, plus £800 = 6,560.
  // (24,850 − 6,560) ÷ 24,850.
  near(offers.overallMargin(OFFER_SET), 73.6);

  // §5.9 is explicit that this is not the average of the offer margins.
  const perOfferMargins = OFFER_SET.map((o) => offers.margin(o)!);
  const naiveAverage = perOfferMargins.reduce((a, b) => a + b, 0) / perOfferMargins.length;
  assert.notEqual(
    Number(offers.overallMargin(OFFER_SET)!.toFixed(2)),
    Number(naiveAverage.toFixed(2)),
  );

  // (24,850 − 800) ÷ 96.
  near(offers.overallEffectiveHourlyRate(OFFER_SET), 250.52);
  assert.equal(offers.monthlyRecurringRevenue(OFFER_SET), 5500);
});

test("5.10 financials", () => {
  const month = {
    revenueFromOffers: 24850, otherIncome: 0,
    fixedCosts: 3200, variableCosts: 6100, teamCosts: 4230,
    investmentSpend: 0, cashInBank: 41000,
  };
  assert.equal(financials.totalRevenue(month), 24850);
  assert.equal(financials.totalCosts(month), 13530);
  assert.equal(financials.profit(month), 11320); // the mockup's Profit card
  near(financials.profitMargin(month), 45.55);
  near(financials.costsAsPercentOfRevenue(month), 54.45);
});

test("5.10 runway needs three months of costs", () => {
  assert.equal(financials.runway(41000, [13530, 12000]), null);
  // Average 13,000 a month.
  near(financials.runway(39000, [12000, 13000, 14000]), 3);
});

// ---------------------------------------------------------------------------
test("6.2 stage numbers", () => {
  near(launch.showUpRate(118, 250), 47.2);
  near(launch.dayDropOff(84, 118), 71.19);
  near(launch.pitchRetention(60, 84), 71.43);
  near(launch.percentOfSignUpGoal(250, 300), 83.33);
});

test("6.4 sales, with a payment plan at full contract value", () => {
  const options = [
    { name: "Pay in full early bird", price: 1500, sales: 8 },
    { name: "Payment plan", price: 1800, sales: 4, isMain: false },
    { name: "Pay in full", price: 1750, sales: 2, isMain: true },
  ];
  assert.equal(launch.totalSales(options), 14);
  // 12,000 + 7,200 + 3,500.
  assert.equal(launch.totalRevenue(options), 22700);
  assert.equal(launch.revenueStillToCollect(22700, 21400), 1300);
  near(launch.averageOrderValue(22700, 14), 1621.43);
  near(launch.percentOfGoal(14, 20), 70); // the mockup's 14/20 ring
  near(launch.conversionRate(14, 250), 5.6);
});

test("6.4 sales by source has to add up, and the form is told when it doesn't", () => {
  assert.equal(launch.sourcesReconcile([7, 4, 2, 1, 0], 14), true);
  assert.equal(launch.sourcesReconcile([7, 4, 2, 1, 0], 15), false);
});

test("6.5 pipeline and ads", () => {
  near(launch.replyRate(45, 300), 15);
  near(launch.callToCloseRate(6, 20), 30);
  near(launch.costPerSignUp(2500, 250), 10);
  near(launch.costPerSale(2500, 14), 178.57); // the mockup's £178 cost per sale
  near(launch.roas(22700, 2500), 9.08);
});

test("6.6 the launch planner — the brief's worked check, not the mockup's", () => {
  // §6.6: "30 sales at 5% conversion needs 600 live attendees; at 47%
  // show-up that's 1,277 sign-ups (always round up)." §12: "the approved
  // mockup shows 600 sign-ups, which is wrong. Build to this formula, not
  // the mockup." This is the test that stops 600 coming back.
  const plan = launch.planner({
    salesGoal: 30, conversionRatePercent: 5, showUpRatePercent: 47,
  });
  assert.equal(plan.liveAttendeesNeeded, 600);
  assert.equal(plan.signUpsNeeded, 1277);
  assert.notEqual(plan.signUpsNeeded, 600);
});

test("6.6 the planner always rounds up", () => {
  // 10 ÷ 3% = 333.33 attendees, and you cannot plan for a third of a person.
  const plan = launch.planner({
    salesGoal: 10, conversionRatePercent: 3, showUpRatePercent: 50,
  });
  assert.equal(plan.liveAttendeesNeeded, 334);
  assert.equal(plan.signUpsNeeded, 668);
});

test("6.6 the planner with no rates yet is a dash, not a plan", () => {
  const plan = launch.planner({
    salesGoal: 30, conversionRatePercent: 0, showUpRatePercent: 47,
  });
  assert.equal(plan.liveAttendeesNeeded, null);
  assert.equal(plan.signUpsNeeded, null);
});

// ---------------------------------------------------------------------------
test("7 traffic lights against a target, up is good", () => {
  assert.equal(trafficLight({ value: 300, target: 250, goodDirection: "up" }), "green");
  assert.equal(trafficLight({ value: 250, target: 250, goodDirection: "up" }), "green");
  assert.equal(trafficLight({ value: 200, target: 250, goodDirection: "up" }), "amber"); // 80%
  assert.equal(trafficLight({ value: 199, target: 250, goodDirection: "up" }), "red");
});

test("7 traffic lights against a target, down is good", () => {
  assert.equal(trafficLight({ value: 90, target: 100, goodDirection: "down" }), "green");
  assert.equal(trafficLight({ value: 100, target: 100, goodDirection: "down" }), "green");
  assert.equal(trafficLight({ value: 120, target: 100, goodDirection: "down" }), "amber");
  assert.equal(trafficLight({ value: 121, target: 100, goodDirection: "down" }), "red");
});

test("7 falls to the benchmark only when there is no target", () => {
  // 30 beats the benchmark of 20 outright, which alone would be green. The
  // target is 50, and 30 is 60% of it, so the first rule that applies says
  // red. §7: "each metric uses the first rule that applies."
  assert.equal(
    trafficLight({ value: 30, target: 50, benchmark: 20, goodDirection: "up" }),
    "red",
  );
  assert.equal(
    trafficLight({ value: 30, benchmark: 20, goodDirection: "up" }),
    "green",
    "the same value with no target set",
  );
  assert.equal(trafficLight({ value: 30, benchmark: 20, goodDirection: "up" }), "green");
  assert.equal(trafficLight({ value: 17, benchmark: 20, goodDirection: "up" }), "amber");
  assert.equal(trafficLight({ value: 15, benchmark: 20, goodDirection: "up" }), "red");
});

test("7 falls to last month only when there is neither", () => {
  assert.equal(trafficLight({ value: 110, lastMonth: 100, goodDirection: "up" }), "green");
  assert.equal(trafficLight({ value: 103, lastMonth: 100, goodDirection: "up" }), "amber");
  assert.equal(trafficLight({ value: 97, lastMonth: 100, goodDirection: "up" }), "amber");
  assert.equal(trafficLight({ value: 90, lastMonth: 100, goodDirection: "up" }), "red");
  // Down is good: falling is the improvement.
  assert.equal(trafficLight({ value: 90, lastMonth: 100, goodDirection: "down" }), "green");
});

test("7 no light where there is no such thing as good — §5's n/a", () => {
  // Ad spend and the lead source split. A light on spend would be an opinion
  // the tool has no basis for.
  assert.equal(trafficLight({ value: 536, target: 500, goodDirection: "none" }), null);
  assert.equal(trafficLight({ value: null, target: 500, goodDirection: "up" }), null);
  assert.equal(trafficLight({ value: 100, goodDirection: "up" }), null);
});

// ---------------------------------------------------------------------------
test("4 year to date recalculates rates from totals, never averages them", () => {
  assert.equal(yearToDateTotal([1000, 2000, 1500]), 4500);

  // A quiet month and a busy one. Averaging the two monthly rates gives 30%;
  // the honest figure from the year's totals is 10.9%.
  const clients = [1, 10];
  const callsHeld = [2, 100];
  near(yearToDateRate(clients, callsHeld), 10.78);

  const monthlyRates = [percentage(1, 2)!, percentage(10, 100)!];
  const averaged = (monthlyRates[0] + monthlyRates[1]) / 2;
  assert.equal(averaged, 30);
  assert.notEqual(Number(yearToDateRate(clients, callsHeld)!.toFixed(2)), averaged);
});

test("4 month-on-month change", () => {
  near(monthOnMonthChange(24850, 21060), 18);
  near(monthOnMonthChange(14, 18), -22.22);
});

// ---------------------------------------------------------------------------
test("6.3 average open and click rate per stage", () => {
  near(launch.averageRatePerStage([48, 42, 39]), 43);
  // A stage with one email unrecorded reports the average of what is known,
  // not half its real open rate.
  near(launch.averageRatePerStage([48, null, 42]), 45);
  assert.equal(launch.averageRatePerStage([]), null);
  assert.equal(launch.averageRatePerStage([null, undefined]), null);
});

// ---------------------------------------------------------------------------
test("every calculated metric in the seed has a formula behind it", async () => {
  // §9's promise is that the entry screen and the report cannot disagree,
  // because both call this module. That holds only while every calc metric
  // has something here to call. With 174 metrics generated out of the brief,
  // the failure mode is a new field arriving in the spec and nothing
  // noticing that nothing computes it — which is how this test found the two
  // per-stage email averages of §6.3 missing.
  const seed = await readFile(
    new URL("../../../supabase/migrations/20260930123000_report_metrics_seed.sql", import.meta.url),
    "utf8",
  );

  const calcKeys = [...seed.matchAll(/^ {2}\('([a-z0-9_]+)', '[a-z_]+', '[^']*', 'calc'/gm)]
    .map((m) => m[1]);

  assert.ok(calcKeys.length > 50, `parsed only ${calcKeys.length} calc metrics — has the seed format changed?`);

  const missing = calcKeys.filter((k) => !(k in CALC_COVERAGE));
  assert.deepEqual(missing, [], "calculated metrics with no formula");

  const orphaned = Object.keys(CALC_COVERAGE).filter((k) => !calcKeys.includes(k));
  assert.deepEqual(orphaned, [], "formulas for metrics that are no longer in the seed");
});

test("every pulled metric either has a source or is named as not having one", async () => {
  // A pulled metric is the same figure showing on a second screen. It cannot
  // be stored — report_values refuses one — so if nothing produces it, the
  // screen shows a dash forever and nothing complains. That is exactly what
  // happened to financials_revenue_from_offers, which made Revenue and Profit
  // blank on a month with offers entered.
  const seed = await readFile(
    new URL("../../../supabase/migrations/20260930123000_report_metrics_seed.sql", import.meta.url),
    "utf8",
  );

  const pulledKeys = [...seed.matchAll(/^ {2}\('([a-z0-9_]+)', '[a-z_]+', '[^']*', 'pulled'/gm)]
    .map((m) => m[1]);

  assert.ok(pulledKeys.length >= 3, `parsed only ${pulledKeys.length} pulled metrics`);

  const unaccounted = pulledKeys.filter(
    (k) => !(k in PULLED_COVERAGE) && !PULLED_NOT_IMPLEMENTED.includes(k),
  );
  assert.deepEqual(unaccounted, [], "pulled metrics with no source and no note saying so");

  // The known gap stays a known gap: if it is implemented, this fails and the
  // list gets tidied rather than quietly keeping a stale exception.
  for (const key of PULLED_NOT_IMPLEMENTED) {
    assert.ok(pulledKeys.includes(key), `${key} is listed as unimplemented but is not a pulled metric`);
    assert.ok(!(key in PULLED_COVERAGE), `${key} is both implemented and listed as not`);
  }
});
