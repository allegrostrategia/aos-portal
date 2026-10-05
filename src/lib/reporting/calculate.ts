import {
  ads,
  clientExperience,
  email,
  financials,
  funnels,
  leads,
  offers,
  social,
  trialReels,
  type Figure,
  type OfferMonth,
  type Result,
} from "./formulas.ts";
import type { CategoryKey } from "./categories.ts";

/**
 * From typed figures to worked-out ones, keyed by metric.
 *
 * `formulas.ts` holds the arithmetic as named functions with real arguments,
 * which is what makes it testable against the brief's worked examples. The
 * screens, though, deal in metric keys — the entry form is generated from
 * `report_metrics`, so it has a bag of strings and no idea which argument
 * goes where. This is the one place those two shapes meet.
 *
 * Keeping it separate from `formulas.ts` matters: the arithmetic should not
 * have to know that a database exists, and this file should not be where
 * anybody is tempted to do a sum inline. Every value below comes out of a
 * named function.
 *
 * The result is what the "Worked out for you" card renders (§3) and what the
 * report reads. Both call this, so they cannot disagree (§9).
 */

/** Reads a figure for a metric key, at month level or for one entity. */
export type Lookup = (metricKey: string) => Figure;

export interface CalcInput {
  /** This month's typed figures. */
  value: Lookup;
  /** Last month's, which several formulas are defined against. */
  previous: Lookup;
  /** Set up per offer, needed for the Offers page's sums. */
  offerRows?: OfferMonth[];
  /** For "share of total revenue". */
  totalRevenue?: Figure;
}

export type CalcResults = Record<string, Result>;

/**
 * Work out everything calculable in one category.
 *
 * Returns only the keys it can produce, so a caller can render what is there
 * and leave a dash for the rest. A metric missing from the result and a
 * metric present with `null` mean the same thing to a reader — "not yet" —
 * and the renderer treats them the same.
 */
export function calculate(category: CategoryKey, input: CalcInput): CalcResults {
  const v = input.value;
  const p = input.previous;

  switch (category) {
    case "social_media":
      return {
        social_media_net_follower_growth: social.netFollowerGrowth(
          v("social_media_followers_at_month_end"),
          p("social_media_followers_at_month_end"),
        ),
        social_media_follower_growth: social.followerGrowthPercent(
          v("social_media_followers_at_month_end"),
          p("social_media_followers_at_month_end"),
        ),
        social_media_engagement_rate: social.engagementRate({
          likesAndComments: v("social_media_likes_plus_comments"),
          saves: v("social_media_saves"),
          shares: v("social_media_shares"),
          reach: v("social_media_reach"),
        }),
        social_media_save_rate: social.saveRate(
          v("social_media_saves"),
          v("social_media_reach"),
        ),
        social_media_share_rate: social.shareRate(
          v("social_media_shares"),
          v("social_media_reach"),
        ),
        social_media_reach_per_post: social.reachPerPost(
          v("social_media_reach"),
          v("social_media_posts_published"),
        ),
        social_media_profile_visit_to_follow: social.profileVisitToFollow(
          v("social_media_follows_gained"),
          v("social_media_profile_visits"),
        ),
        social_media_non_follower_reach: social.nonFollowerReachPercent(
          v("social_media_reach_from_non_followers"),
          v("social_media_reach_from_followers"),
        ),
      };

    case "trial_reels":
      return {
        trial_reels_average_views_per_reel: trialReels.averageViewsPerReel(
          v("trial_reels_total_views"),
          v("trial_reels_trial_reels_posted"),
        ),
        trial_reels_follows_per_1k_views: trialReels.followsPer1kViews(
          v("trial_reels_new_followers_from_trial_reels"),
          v("trial_reels_total_views"),
        ),
        trial_reels_profile_visit_to_follow_rate: trialReels.profileVisitToFollowRate(
          v("trial_reels_new_followers_from_trial_reels"),
          v("trial_reels_profile_visits"),
        ),
        trial_reels_followers_per_hour: trialReels.followersPerHour(
          v("trial_reels_new_followers_from_trial_reels"),
          v("trial_reels_hours_spent_on_trial_reels"),
        ),
        trial_reels_hours_per_buyer: trialReels.hoursPerBuyer(
          v("trial_reels_hours_spent_on_trial_reels"),
          v("trial_reels_buyers_from_trial_reels"),
        ),
      };

    case "email":
      return {
        email_net_list_growth: email.netListGrowth(
          v("email_list_size_at_month_end"),
          p("email_list_size_at_month_end"),
        ),
        // Against LAST month's list: the list the sends actually went to.
        email_unsubscribe_rate: email.unsubscribeRate(
          v("email_unsubscribes"),
          p("email_list_size_at_month_end"),
        ),
        email_click_to_open_rate: email.clickToOpenRate(
          v("email_average_click_rate"),
          v("email_average_open_rate"),
        ),
        email_revenue_per_subscriber: email.revenuePerSubscriber(
          v("email_revenue_from_email"),
          v("email_list_size_at_month_end"),
        ),
      };

    case "funnels":
      return {
        funnels_opt_in_rate: funnels.optInRate(
          v("funnels_opt_ins"),
          v("funnels_landing_page_views"),
        ),
        funnels_sales_page_conversion: funnels.salesPageConversion(
          v("funnels_purchases"),
          v("funnels_sales_page_views"),
        ),
        funnels_checkout_completion: funnels.checkoutCompletion(
          v("funnels_purchases"),
          v("funnels_checkouts_started"),
        ),
        funnels_overall_conversion: funnels.overallConversion(
          v("funnels_purchases"),
          v("funnels_landing_page_views"),
        ),
        funnels_order_bump_take_rate: funnels.orderBumpTakeRate(
          v("funnels_order_bumps_taken"),
          v("funnels_purchases"),
        ),
        funnels_upsell_take_rate: funnels.upsellTakeRate(
          v("funnels_upsells_taken"),
          v("funnels_purchases"),
        ),
        // funnels_funnel_revenue and revenue_per_visitor need the linked
        // offer's price, which is per-funnel setup rather than a typed figure,
        // so they are worked out on the Funnels screen where that is in hand.
      };

    case "leads_conversions": {
      const sources = {
        social: v("leads_conversions_new_leads_from_social"),
        email: v("leads_conversions_new_leads_from_email"),
        // Pulled from Ads, never typed here (§4, enter once).
        ads: v("ads_leads"),
        referral: v("leads_conversions_new_leads_from_referral"),
        other: v("leads_conversions_new_leads_from_other"),
      };
      return {
        // Pulled from Ads (§5.6's table). Emitted so the Leads page can show
        // the figure without a second box for it.
        leads_conversions_new_leads_from_ads: v("ads_leads") ?? null,
        leads_conversions_total_leads: leads.total(sources),
        leads_conversions_call_show_up_rate: leads.callShowUpRate(
          v("leads_conversions_calls_held"),
          v("leads_conversions_calls_booked"),
        ),
        leads_conversions_close_rate: leads.closeRate(
          v("leads_conversions_new_clients"),
          v("leads_conversions_calls_held"),
        ),
        leads_conversions_lead_to_client_rate: leads.leadToClientRate(
          v("leads_conversions_new_clients"),
          leads.total(sources),
        ),
      };
    }

    case "ads":
      return {
        ads_cpm: ads.cpm(v("ads_spend"), v("ads_impressions")),
        ads_ctr: ads.ctr(v("ads_link_clicks"), v("ads_impressions")),
        ads_cpc: ads.cpc(v("ads_spend"), v("ads_link_clicks")),
        // The blended figure. The headline one counts lead-goal campaigns
        // only and is worked out on the Ads screen, which has the campaigns.
        ads_cost_per_lead: ads.costPerLead(v("ads_spend"), v("ads_leads")),
        ads_cost_per_acquisition: ads.costPerAcquisition(
          v("ads_spend"),
          v("ads_purchases"),
        ),
        ads_roas: ads.roas(v("ads_revenue_from_ads"), v("ads_spend")),
      };

    case "client_experience": {
      const start = v("client_experience_active_clients_at_start");
      const left = v("client_experience_clients_who_left");
      const newClients = v("leads_conversions_new_clients");
      const atEnd = clientExperience.activeClientsAtEnd(start, newClients, left);
      return {
        client_experience_new_clients: newClients ?? null,
        client_experience_active_clients_at_end: atEnd,
        client_experience_retention_rate: clientExperience.retentionRate(start, left),
        client_experience_churn_rate: clientExperience.churnRate(left, start),
        client_experience_upsell_rate: clientExperience.upsellRate(
          v("client_experience_renewals_and_upsells"),
          start,
        ),
        client_experience_issues_per_10_clients: clientExperience.issuesPer10Clients(
          v("client_experience_issues_raised"),
          atEnd,
        ),
        // average_client_lifetime needs twelve months of churn, so it belongs
        // to the report rather than to one month's entry screen.
      };
    }

    case "offers": {
      const rows = input.offerRows ?? [];
      return {
        offers_total_revenue_from_offers: offers.totalRevenue(rows),
        offers_overall_margin: offers.overallMargin(rows),
        offers_total_hours_spent_delivering: offers.totalHours(rows),
        offers_overall_effective_hourly_rate: offers.overallEffectiveHourlyRate(rows),
        financials_monthly_recurring_revenue: offers.monthlyRecurringRevenue(rows),
      };
    }

    case "financials": {
      const month = {
        // PULLED from Offers, never typed (§5.10's own table, and §4's
        // "enter once, use everywhere"). Reading the metric key here would
        // always be null, because report_values refuses to store a pulled
        // figure — so Revenue and Profit would be a dash on every month that
        // had offers entered perfectly well.
        revenueFromOffers: offers.totalRevenue(input.offerRows ?? []),
        otherIncome: v("financials_other_income"),
        fixedCosts: v("financials_fixed_costs"),
        variableCosts: v("financials_variable_costs"),
        teamCosts: v("financials_team_costs"),
        investmentSpend: v("financials_investment_spend"),
        cashInBank: v("financials_cash_in_bank_at_month_end"),
      };
      return {
        financials_revenue_from_offers: month.revenueFromOffers,
        financials_total_revenue: financials.totalRevenue(month),
        financials_total_costs: financials.totalCosts(month),
        financials_profit: financials.profit(month),
        financials_profit_margin: financials.profitMargin(month),
        financials_costs_as_percent_of_revenue:
          financials.costsAsPercentOfRevenue(month),
        // Runway needs three months of costs; the report has them, this screen
        // does not.
      };
    }

    default:
      // overview has no figures of its own (§5.1) and launches has its own
      // screens (§6), so neither calculates anything here.
      return {};
  }
}

/**
 * Everything one offer works out to, which the Offers screen needs per row
 * rather than per category.
 */
export function calculateOffer(
  offer: OfferMonth,
  totalRevenue: Figure,
): CalcResults {
  return {
    offers_delivery_cost: offers.deliveryCost(offer),
    offers_margin: offers.margin(offer),
    offers_effective_hourly_rate: offers.effectiveHourlyRate(offer),
    offers_share_of_total_revenue: offers.shareOfTotalRevenue(
      offer.revenue,
      totalRevenue,
    ),
  };
}

/**
 * Every offer with its own worked-out figures.
 *
 * Takes the rows and the total rather than a `MonthFigures`, so it stays in
 * the pure layer: a screen, a chart and a test can all call it without
 * pulling in the Supabase client. `offerBreakdown` in month-figures.ts is
 * this with the two arguments read off the figures.
 */
export function offerResults(
  offerRows: OfferMonth[],
  totalRevenue: Figure,
): { offer: OfferMonth; results: CalcResults }[] {
  return offerRows.map((offer) => ({ offer, results: calculateOffer(offer, totalRevenue) }));
}

/**
 * A lookup that knows where a metric's figures actually live.
 *
 * Most figures hang off the month. Social Media's hang off a platform, which
 * is the cost of the decision to store them per platform from the start
 * (§5.2: "Instagram first; TikTok and LinkedIn added later using the same
 * structure"). Without this, every caller has to remember which category is
 * the exception, and the one that forgets silently reads null and prints a
 * dash on a month that has figures in it.
 *
 * `entityFor` answers "which entity holds this kind of thing", so the rule
 * lives here once rather than as a string test on the key in four screens.
 */
export function entityAwareLookup(
  read: (metricKey: string, entityId?: string | null) => number | null,
  metricEntityType: Map<string, string | null>,
  entityFor: (entityType: string) => string | null,
): Lookup {
  return (metricKey: string) => {
    const entityType = metricEntityType.get(metricKey) ?? null;
    if (!entityType) return read(metricKey);
    const entityId = entityFor(entityType);
    // No entity set up yet means nothing has been entered against one, and a
    // month-level row is the older shape — try it rather than returning null
    // and claiming a filled-in month is empty.
    return entityId ? read(metricKey, entityId) : read(metricKey);
  };
}
