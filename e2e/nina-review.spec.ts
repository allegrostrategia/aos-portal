import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { MONTHS } from "./guard.ts";
import { requireLocalStack, signIn } from "./helpers.ts";

/**
 * The review pack Nina reads before Stage 3 is switched on.
 *
 * Not a test of anything — it drives the screens and photographs them, so
 * she can look at every Stage 3 surface at both widths and from both
 * sides without anybody installing anything. The numbers are seeded to be
 * plausible for a business like her clients', because a screen full of
 * zeroes tells her nothing about whether the wording works.
 *
 * Run it on its own:
 *   npx playwright test nina-review.spec.ts
 *
 * It writes into docs/nina-review/, numbered in reading order. The README
 * there is the thing she actually reads; these are its illustrations.
 */

requireLocalStack();

const OUT = "docs/nina-review";
const width = (name: string) => (name === "phone" ? "phone" : "desktop") as "phone" | "desktop";

async function shot(page: Page, name: string, w: "phone" | "desktop") {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
}

/**
 * A month of figures that look like somebody's actual business.
 *
 * The seed is built for tests, where the point is a number that can be
 * checked; here the point is a screen that reads like a real report.
 * September is the month on show, August is what it is compared against,
 * and the two differ in both directions so the panels and the lights have
 * something to say.
 */
test.beforeEach(async () => {
  const { seed, sql } = await import("../scripts/seed-test-db.mjs");
  await seed({ quiet: true });

  const ws = `(select id from public.report_workspaces where business_name = 'Northwind Studio')`;
  const admin = `(select id from public.members where role = 'admin' limit 1)`;
  // Delete then insert, not upsert: `report_values`' unique index wraps
  // the nullable entity id in a `coalesce`, so there is no plain
  // constraint for `on conflict` to name.
  const v = (month: string, key: string, value: number) =>
    `delete from public.report_values where workspace_id = ${ws}
       and month = '${month}-01' and metric_key = '${key}' and entity_id is null;
     insert into public.report_values (workspace_id, month, metric_key, value, entered_by)
     values (${ws}, '${month}-01', '${key}', ${value}, ${admin});`;

  /** Figures that hang off a row — an offer, a funnel, a campaign. */
  const ent = (
    type: string,
    name: string,
    month: string,
    pairs: [string, number][],
  ) =>
    pairs
      .map(
        ([key, value]) => `
    delete from public.report_values where workspace_id = ${ws}
      and month = '${month}-01' and metric_key = '${key}'
      and entity_id = (select id from public.report_entities
                        where workspace_id = ${ws} and entity_type = '${type}'
                          and name = '${name}' limit 1);
    insert into public.report_values
      (workspace_id, month, metric_key, entity_id, value, entered_by)
    select ${ws}, '${month}-01', '${key}', e.id, ${value}, ${admin}
      from public.report_entities e
     where e.workspace_id = ${ws} and e.entity_type = '${type}' and e.name = '${name}';`,
      )
      .join("\n");

  sql(`
    -- §5.8's opening figure, on the workspace's first month.
    ${v(MONTHS.jul, "client_experience_clients_at_start_opening", 18)}
    ${v(MONTHS.jul, "client_experience_clients_who_left", 1)}
    ${v(MONTHS.aug, "client_experience_clients_who_left", 2)}
    ${v(MONTHS.aug, "client_experience_issues_raised", 3)}
    ${v(MONTHS.aug, "client_experience_renewals_and_upsells", 1)}
    ${v(MONTHS.sep, "client_experience_clients_who_left", 1)}
    ${v(MONTHS.sep, "client_experience_issues_raised", 1)}
    ${v(MONTHS.sep, "client_experience_renewals_and_upsells", 3)}

    ${v(MONTHS.aug, "trial_reels_trial_reels_posted", 8)}
    ${v(MONTHS.aug, "trial_reels_new_followers_from_trial_reels", 140)}
    ${v(MONTHS.aug, "trial_reels_total_views", 42000)}
    ${v(MONTHS.aug, "trial_reels_profile_visits", 900)}
    ${v(MONTHS.aug, "trial_reels_hours_spent_on_trial_reels", 6)}
    ${v(MONTHS.sep, "trial_reels_trial_reels_posted", 12)}
    ${v(MONTHS.sep, "trial_reels_new_followers_from_trial_reels", 310)}
    ${v(MONTHS.sep, "trial_reels_total_views", 88000)}
    ${v(MONTHS.sep, "trial_reels_profile_visits", 1600)}
    ${v(MONTHS.sep, "trial_reels_hours_spent_on_trial_reels", 7)}

    ${v(MONTHS.aug, "social_media_followers_at_month_end", 4200)}
    ${v(MONTHS.aug, "social_media_posts_published", 14)}
    ${v(MONTHS.aug, "social_media_reach", 52000)}
    ${v(MONTHS.aug, "social_media_likes_plus_comments", 1800)}
    ${v(MONTHS.aug, "social_media_saves", 240)}
    ${v(MONTHS.aug, "social_media_shares", 110)}
    ${v(MONTHS.sep, "social_media_followers_at_month_end", 4680)}
    ${v(MONTHS.sep, "social_media_posts_published", 16)}
    ${v(MONTHS.sep, "social_media_reach", 71000)}
    ${v(MONTHS.sep, "social_media_likes_plus_comments", 2600)}
    ${v(MONTHS.sep, "social_media_saves", 380)}
    ${v(MONTHS.sep, "social_media_shares", 190)}

    ${v(MONTHS.aug, "email_list_size_at_month_end", 3100)}
    ${v(MONTHS.aug, "email_new_subscribers", 180)}
    ${v(MONTHS.aug, "email_unsubscribes", 24)}
    ${v(MONTHS.aug, "email_emails_sent", 6)}
    ${v(MONTHS.aug, "email_average_open_rate", 38)}
    ${v(MONTHS.aug, "email_average_click_rate", 3.1)}
    ${v(MONTHS.sep, "email_list_size_at_month_end", 3460)}
    ${v(MONTHS.sep, "email_new_subscribers", 410)}
    ${v(MONTHS.sep, "email_unsubscribes", 50)}
    ${v(MONTHS.sep, "email_emails_sent", 8)}
    ${v(MONTHS.sep, "email_average_open_rate", 41)}
    ${v(MONTHS.sep, "email_average_click_rate", 3.8)}

    ${v(MONTHS.aug, "financials_fixed_costs", 2400)}
    ${v(MONTHS.aug, "financials_variable_costs", 900)}
    ${v(MONTHS.aug, "financials_team_costs", 3200)}
    ${v(MONTHS.aug, "financials_cash_in_bank_at_month_end", 18500)}
    ${v(MONTHS.sep, "financials_fixed_costs", 2400)}
    ${v(MONTHS.sep, "financials_variable_costs", 1100)}
    ${v(MONTHS.sep, "financials_team_costs", 3200)}
    ${v(MONTHS.sep, "financials_cash_in_bank_at_month_end", 24900)}

    -- September's per-row figures, so the Ads, Funnels and Offers tabs
    -- have something on them. Without these the three screens Nina most
    -- needs to judge are empty, and Revenue and Profit on the Overview
    -- are a dash.
    ${ent("offer", "Signature programme", MONTHS.sep, [
      ["offers_units_sold", 14],
      ["offers_revenue_this_month", 7000],
      ["offers_hours_spent_delivering", 42],
    ])}
    ${ent("offer", "Signature programme", MONTHS.aug, [
      ["offers_units_sold", 11],
      ["offers_revenue_this_month", 5500],
      ["offers_hours_spent_delivering", 38],
    ])}
    ${ent("funnel", "Webinar funnel", MONTHS.sep, [
      ["funnels_landing_page_views", 3200],
      ["funnels_opt_ins", 780],
      ["funnels_sales_page_views", 310],
      ["funnels_checkouts_started", 46],
      ["funnels_purchases", 28],
    ])}
    -- The five campaigns the seed creates, by their real names. Two with
    -- a leads goal, one sales, one profile visits, one nobody classified
    -- — which is §10.2's worked case, and the reason cost per lead counts
    -- lead-goal spend only. Worth Nina seeing it on a screen.
    ${ent("ad_campaign", "Lead form", MONTHS.sep, [
      ["ads_spend", 250], ["ads_impressions", 30000], ["ads_link_clicks", 2000],
      ["ads_leads", 60], ["ads_purchases", 4], ["ads_revenue_from_ads", 2000],
    ])}
    ${ent("ad_campaign", "Workshop opt-in", MONTHS.sep, [
      ["ads_spend", 150], ["ads_impressions", 20000], ["ads_link_clicks", 1500],
      ["ads_leads", 40], ["ads_purchases", 2], ["ads_revenue_from_ads", 900],
    ])}
    ${ent("ad_campaign", "Retargeting sales", MONTHS.sep, [
      ["ads_spend", 50], ["ads_impressions", 5000], ["ads_link_clicks", 400],
      ["ads_leads", 0], ["ads_purchases", 3], ["ads_revenue_from_ads", 1500],
    ])}
    ${ent("ad_campaign", "Profile visits", MONTHS.sep, [
      ["ads_spend", 100], ["ads_impressions", 3000], ["ads_link_clicks", 0],
    ])}
    ${ent("ad_campaign", "Unclassified", MONTHS.sep, [
      ["ads_spend", 50], ["ads_impressions", 2000], ["ads_link_clicks", 300],
    ])}

    -- Targets, so the bar and "is at 40% of your target" have something
    -- to draw. Five, which is what the Overview shows.
    insert into public.report_targets (workspace_id, metric_key, target_value) values
      (${ws}, 'leads_conversions_new_clients', 6),
      (${ws}, 'leads_conversions_total_leads', 150),
      (${ws}, 'financials_total_revenue', 20000),
      (${ws}, 'email_list_size_at_month_end', 4000),
      (${ws}, 'social_media_followers_at_month_end', 5000)
    on conflict do nothing;

    -- Benchmarks, so the traffic lights have a third thing to measure
    -- against and can say which one they used.
    insert into public.report_benchmarks (workspace_id, metric_key, benchmark_value) values
      (${ws}, 'email_average_open_rate', 35),
      (${ws}, 'leads_conversions_lead_to_client_rate', 4),
      (${ws}, 'client_experience_churn_rate', 5)
    on conflict do nothing;

    -- The seed already gives these months their top-three hooks and
    -- b-roll, with one hook repeating from August so the Proven marker
    -- shows. Nothing to add here: an earlier version of this file
    -- inserted its own, collided with the seed's, and did nothing at
    -- all -- which an ON CONFLICT DO NOTHING reports by saying nothing.
  `);
});

/** Nina drafts, looks, publishes — so the client's side is real. */
async function publishSeptember(page: Page) {
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  const publish = page.getByRole("button", { name: /^publish this month$/i });
  if (await publish.count()) {
    await publish.click();
    const anyway = page.getByRole("button", { name: /publish anyway/i });
    if (await anyway.count()) await anyway.click();
    await expect(page.getByText(/^Published$/).first()).toBeVisible();
  }
}

test("the pack", async ({ page }, info) => {
  const w = width(info.project.name);

  // --- 01-05  The Overview, as the team drafts it ---------------------
  await signIn(page, "nina");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await shot(page, "01-overview-admin", w);

  // --- 06-09  The four Stage 3 tabs, as the team ----------------------
  for (const [n, slug] of [
    ["02-ads", "ads"],
    ["03-funnels", "funnels"],
    ["04-trial-reels", "trial-reels"],
    ["05-client-experience", "client-experience"],
  ] as const) {
    await page.goto(`/reporting/${slug}?month=${MONTHS.sep}`);
    await shot(page, `${n}-admin`, w);
  }

  // --- 10-11  Targets and benchmarks: the team's own screens ----------
  await page.goto(`/reporting/targets?month=${MONTHS.sep}`);
  await shot(page, "06-targets-admin", w);
  await page.goto(`/reporting/benchmarks?month=${MONTHS.sep}`);
  await shot(page, "07-benchmarks-admin", w);

  // --- 12  Publishing out of order ------------------------------------
  // August is a draft with figures in it, so September cannot go out
  // without her saying so twice.
  const { takeBackToDraft } = await import("./helpers.ts");
  await takeBackToDraft(MONTHS.aug);
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await shot(page, "08-publish-warning-admin", w);
  await page.getByRole("button", { name: /^publish this month$/i }).click();
  await expect(page.getByRole("button", { name: /publish anyway/i })).toBeVisible();
  await shot(page, "09-publish-anyway-admin", w);

  // Put August back and publish September properly, for the client's side.
  const { seed, sql } = await import("../scripts/seed-test-db.mjs");
  void seed;
  sql(`update public.report_periods p set published_at = now(), published_by =
         (select id from public.members where role = 'admin' limit 1)
        from public.report_workspaces w
       where w.id = p.workspace_id and w.business_name = 'Northwind Studio'
         and p.month = '${MONTHS.aug}-01';`);
  await publishSeptember(page);

  // --- 13  Taking a month back ----------------------------------------
  await page.goto(`/reporting/enter/client-experience?month=${MONTHS.aug}`);
  await shot(page, "10-unpublish-warning-admin", w);

  // --- 14-18  Everything the client sees -------------------------------
  await signIn(page, "client");
  await page.goto(`/reporting?month=${MONTHS.sep}`);
  await shot(page, "11-overview-client", w);
  for (const [n, slug] of [
    ["12-ads", "ads"],
    ["13-funnels", "funnels"],
    ["14-trial-reels", "trial-reels"],
    ["15-client-experience", "client-experience"],
  ] as const) {
    await page.goto(`/reporting/${slug}?month=${MONTHS.sep}`);
    await shot(page, `${n}-client`, w);
  }
});
