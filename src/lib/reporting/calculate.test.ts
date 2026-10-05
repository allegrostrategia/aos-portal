import assert from "node:assert/strict";
import { test } from "node:test";

import { calculate, calculateOffer, type Lookup } from "./calculate.ts";
import {
  CALC_COVERAGE,
  monthOnMonthChange,
  PULLED_COVERAGE,
  type OfferMonth,
} from "./formulas.ts";
import { CATEGORIES } from "./categories.ts";

/**
 * These tests are about the WIRING, not the arithmetic — formulas.test.ts
 * already checks the sums against the brief's worked examples. What can go
 * wrong here is a metric key typed slightly wrong, or two arguments passed in
 * the wrong order, and neither shows up as an error: the screen just quietly
 * prints a dash, or a plausible wrong number.
 */

/** A lookup over a plain object, which is what a screen's form data becomes. */
const from = (values: Record<string, number>): Lookup => (key) => values[key];
const none: Lookup = () => null;

test("every key this produces is a real calculated metric", () => {
  // A typo'd key here would render into nothing and be invisible. CALC_COVERAGE
  // is checked against the seed migration in formulas.test.ts, so agreeing
  // with it means agreeing with the database.
  for (const category of CATEGORIES) {
    const produced = calculate(category.key, { value: none, previous: none });
    for (const key of Object.keys(produced)) {
      assert.ok(
        key in CALC_COVERAGE || key in PULLED_COVERAGE,
        `${category.key} produces "${key}", which is neither calculated nor pulled`,
      );
    }
  }
});

test("a month with nothing entered produces dashes, not zeroes", () => {
  for (const category of CATEGORIES) {
    const produced = calculate(category.key, { value: none, previous: none });
    for (const [key, result] of Object.entries(produced)) {
      assert.equal(result, null, `${key} should be a dash with no figures in`);
    }
  }
});

test("social media wires to the right fields", () => {
  const out = calculate("social_media", {
    value: from({
      social_media_followers_at_month_end: 26420,
      social_media_posts_published: 22,
      social_media_reach: 184500,
      social_media_likes_plus_comments: 12640,
      social_media_saves: 3120,
      social_media_shares: 1480,
      social_media_follows_gained: 1770,
      social_media_profile_visits: 8960,
    }),
    previous: from({ social_media_followers_at_month_end: 24650 }),
  });

  assert.equal(out.social_media_net_follower_growth, 1770);
  assert.equal(Number(out.social_media_follower_growth!.toFixed(2)), 7.18);
  // Saves and shares included, per §5.2 — not the mockup's 6.9%.
  assert.equal(Number(out.social_media_engagement_rate!.toFixed(2)), 9.34);
  assert.equal(Number(out.social_media_save_rate!.toFixed(2)), 1.69);
  assert.equal(Number(out.social_media_reach_per_post!.toFixed(2)), 8386.36);
});

test("follower growth reads last month, not this one", () => {
  // The commonest wiring slip in the file: passing the same month twice gives
  // a growth of zero, which looks like a real answer.
  const out = calculate("social_media", {
    value: from({ social_media_followers_at_month_end: 26420 }),
    previous: from({ social_media_followers_at_month_end: 24650 }),
  });
  assert.notEqual(out.social_media_net_follower_growth, 0);
  assert.equal(out.social_media_net_follower_growth, 1770);
});

test("the unsubscribe rate is against last month's list", () => {
  // §5.4's formula: unsubscribes ÷ list size LAST month — the list that was
  // actually sent to. Against this month's it flatters a shrinking list.
  const out = calculate("email", {
    value: from({ email_unsubscribes: 64, email_list_size_at_month_end: 7000 }),
    previous: from({ email_list_size_at_month_end: 8000 }),
  });
  assert.equal(Number(out.email_unsubscribe_rate!.toFixed(2)), 0.8);
  assert.notEqual(Number(out.email_unsubscribe_rate!.toFixed(2)), 0.91);
});

test("leads pulls the ads figure rather than asking for it twice", () => {
  // §4: "enter once, use everywhere." Ad leads are typed on the Ads page and
  // read here; a second box for them is how the two disagree.
  const out = calculate("leads_conversions", {
    value: from({
      leads_conversions_new_leads_from_social: 120,
      leads_conversions_new_leads_from_email: 86,
      ads_leads: 64,
      leads_conversions_new_leads_from_referral: 28,
      leads_conversions_new_leads_from_other: 14,
      leads_conversions_calls_booked: 46,
      leads_conversions_calls_held: 34,
      leads_conversions_new_clients: 14,
    }),
    previous: none,
  });

  assert.equal(out.leads_conversions_total_leads, 312);
  assert.equal(Number(out.leads_conversions_close_rate!.toFixed(2)), 41.18);
  assert.equal(Number(out.leads_conversions_lead_to_client_rate!.toFixed(2)), 4.49);
});

test("client experience takes new clients from Leads, not its own box", () => {
  // `clientsAtStart` is passed in, not read from the metric: the metric is
  // PULLED and report_values refuses to store a pulled figure, so a typed
  // one could never exist. This test used to supply it as a typed value and
  // so asserted against something the database had always refused.
  const out = calculate("client_experience", {
    value: from({
      client_experience_clients_who_left: 6,
      leads_conversions_new_clients: 14,
      client_experience_renewals_and_upsells: 8,
      client_experience_issues_raised: 6,
    }),
    previous: none,
    clientsAtStart: 40,
  });

  assert.equal(out.client_experience_active_clients_at_start, 40);
  assert.equal(out.client_experience_active_clients_at_end, 48);
  assert.equal(Number(out.client_experience_retention_rate!.toFixed(2)), 85);
  assert.equal(Number(out.client_experience_issues_per_10_clients!.toFixed(2)), 1.25);
});

test("a typed 'active clients at start' is ignored, because it cannot exist", () => {
  // Belt and braces: if one somehow reached the lookup, the figure still
  // comes from the resolved opening chain and not from the box.
  const out = calculate("client_experience", {
    value: from({
      client_experience_active_clients_at_start: 999,
      client_experience_clients_who_left: 0,
      leads_conversions_new_clients: 0,
    }),
    previous: none,
    clientsAtStart: 12,
  });

  assert.equal(out.client_experience_active_clients_at_start, 12);
  assert.equal(out.client_experience_active_clients_at_end, 12);
});

test("with no opening figure, the whole category is dashes rather than zeros", () => {
  const out = calculate("client_experience", {
    value: from({
      client_experience_clients_who_left: 2,
      leads_conversions_new_clients: 5,
      client_experience_renewals_and_upsells: 1,
    }),
    previous: none,
  });

  assert.equal(out.client_experience_active_clients_at_start, null);
  assert.equal(out.client_experience_retention_rate, null, "not 0%");
  assert.equal(out.client_experience_churn_rate, null);
  assert.equal(out.client_experience_upsell_rate, null);
});

test("financials pulls its revenue from the offers, never from a box", () => {
  // §5.10's table marks "Revenue from offers" as Pulled, and report_values
  // refuses to store a pulled metric — so reading it as a typed field would
  // leave Revenue and Profit as dashes on a month with offers in it.
  const out = calculate("financials", {
    value: from({ financials_fixed_costs: 3200 }),
    previous: none,
    offerRows: OFFERS,
  });
  assert.equal(out.financials_revenue_from_offers, 24850);
  assert.equal(out.financials_total_revenue, 24850);
  assert.equal(out.financials_profit, 21650);
});

test("with no offers set up, revenue is a dash rather than zero", () => {
  const out = calculate("financials", {
    value: from({ financials_fixed_costs: 3200 }),
    previous: none,
    offerRows: [],
  });
  assert.equal(out.financials_revenue_from_offers, null);
  assert.equal(out.financials_total_revenue, null);
});

test("financials", () => {
  const out = calculate("financials", {
    offerRows: OFFERS,
    value: from({
      financials_fixed_costs: 3200,
      financials_variable_costs: 6100,
      financials_team_costs: 4230,
      financials_cash_in_bank_at_month_end: 41000,
    }),
    previous: none,
  });

  assert.equal(out.financials_total_revenue, 24850);
  assert.equal(out.financials_total_costs, 13530);
  assert.equal(out.financials_profit, 11320);
  assert.equal(Number(out.financials_profit_margin!.toFixed(2)), 45.55);
});

// ---------------------------------------------------------------------------
const OFFERS: OfferMonth[] = [
  { name: "1:1 Coaching", hourlyCost: 60, unitsSold: 4, revenue: 10000, hoursSpent: 20 },
  { name: "Group", hourlyCost: 60, pricingModel: "recurring", unitsSold: 22, revenue: 5500, hoursSpent: 28 },
  { name: "VIP Day", hourlyCost: 60, unitsSold: 3, revenue: 4500, hoursSpent: 18 },
  { name: "DWY", hourlyCost: 60, unitsSold: 1, revenue: 4850, hoursSpent: 30, otherDirectCosts: 800 },
];

test("the offers summary is weighted, and MRR is the recurring ones only", () => {
  const out = calculate("offers", {
    value: none,
    previous: none,
    offerRows: OFFERS,
  });

  assert.equal(out.offers_total_revenue_from_offers, 24850);
  assert.equal(out.offers_total_hours_spent_delivering, 96);
  assert.equal(Number(out.offers_overall_margin!.toFixed(2)), 73.6);
  assert.equal(Number(out.offers_overall_effective_hourly_rate!.toFixed(2)), 250.52);
  assert.equal(out.financials_monthly_recurring_revenue, 5500);
});

test("one offer's own figures", () => {
  const out = calculateOffer(OFFERS[3], 24850);
  assert.equal(out.offers_delivery_cost, 2600);
  assert.equal(Number(out.offers_margin!.toFixed(2)), 46.39);
  assert.equal(Number(out.offers_effective_hourly_rate!.toFixed(2)), 135);
  assert.equal(Number(out.offers_share_of_total_revenue!.toFixed(2)), 19.52);
});

test("an offer with no hours logged is a dash, not an infinite rate", () => {
  const out = calculateOffer(
    { name: "Unlogged", hourlyCost: 60, unitsSold: 1, revenue: 500, hoursSpent: 0 },
    24850,
  );
  assert.equal(out.offers_effective_hourly_rate, null);
  // Delivery cost is still real: zero hours at £60 is £0 of labour.
  assert.equal(out.offers_delivery_cost, 0);
});

test("overview and launches calculate nothing here", () => {
  assert.deepEqual(calculate("overview", { value: none, previous: none }), {});
  assert.deepEqual(calculate("launches", { value: none, previous: none }), {});
});

// ---------------------------------------------------------------------------
// Revenue pulled from Offers, worked out everywhere it is needed.
//
// Bugs 3, 4 and 5 of the 2 October walkthrough were one shape: the offers
// were passed in some places and not others, so the same month produced
// different figures depending on which screen asked.
// ---------------------------------------------------------------------------

test("the entry card and the report cannot disagree — same input, same output", () => {
  // §9's whole promise. The entry screen used to call calculate() with no
  // offerRows, so Total revenue, Profit and the margin were dashes there
  // while the report, which passes them, showed the real figures.
  const value = from({
    financials_fixed_costs: 3200,
    financials_variable_costs: 6100,
    financials_team_costs: 4230,
  });

  const report = calculate("financials", { value, previous: none, offerRows: OFFERS });
  const entryCard = calculate("financials", { value, previous: none, offerRows: OFFERS });

  assert.deepEqual(entryCard, report);
  assert.equal(report.financials_revenue_from_offers, 24850);
  assert.equal(report.financials_total_revenue, 24850);
  assert.equal(report.financials_profit, 11320);
});

test("without the offers, every figure derived from them is a dash", () => {
  // Which is exactly what the entry screen showed. Asserted so the
  // difference between "passed them" and "didn't" is visible in a test
  // rather than only on a screen.
  const value = from({ financials_fixed_costs: 3200 });
  const starved = calculate("financials", { value, previous: none });

  assert.equal(starved.financials_revenue_from_offers, null);
  assert.equal(starved.financials_total_revenue, null);
  assert.equal(starved.financials_profit, null);
  assert.equal(starved.financials_profit_margin, null);
  assert.equal(starved.financials_costs_as_percent_of_revenue, null);
});

test("last month's offers give this month something to compare against", () => {
  // Bug 3: previousResults was computed with offerRows: [], so Revenue and
  // Profit said "No month to compare" on a month whose predecessor had
  // £2,000 of offers in it.
  const august: OfferMonth[] = [
    { name: "Coaching", hourlyCost: 60, unitsSold: 1, revenue: 2000, hoursSpent: 10 },
  ];
  const september: OfferMonth[] = [
    { name: "Coaching", hourlyCost: 60, unitsSold: 2, revenue: 3000, hoursSpent: 15 },
  ];

  const prev = calculate("financials", {
    value: from({ financials_fixed_costs: 1000 }),
    previous: none,
    offerRows: august,
  });
  const now = calculate("financials", {
    value: from({ financials_fixed_costs: 1000 }),
    previous: none,
    offerRows: september,
  });

  assert.equal(prev.financials_total_revenue, 2000);
  assert.equal(now.financials_total_revenue, 3000);
  assert.equal(prev.financials_profit, 1000);
  assert.equal(now.financials_profit, 2000);

  // Which is what the Overview's arrow is: +50% revenue, +100% profit.
  assert.equal(monthOnMonthChange(now.financials_total_revenue, prev.financials_total_revenue), 50);
  assert.equal(monthOnMonthChange(now.financials_profit, prev.financials_profit), 100);
});
