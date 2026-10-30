import type { ReportIconName } from "@/components/reporting/icons";

/**
 * The mark on a KPI card, per metric.
 *
 * **Per metric, not per category (Dom, 30 October).** The first pass put the
 * category's own glyph on all six of a page's headline cards, on the
 * argument that they are all the same subject. The mockups do not: the
 * Social Media row reads people / person-plus / heart / bars / pointer, one
 * for each thing measured, and a row of five identical shopfronts was the
 * duller reading of the same cards. The icon is still decoration — the
 * label beside it says the same thing in words — but decoration that
 * repeats the label is better than decoration that repeats its neighbour.
 *
 * Only the metrics that reach a headline card need an entry. Anything not
 * here falls back to its category's glyph via `metricIcon`, so a new metric
 * is never a missing icon — it is the category's, which is always true if
 * never interesting.
 */
const METRIC_ICONS: Record<string, ReportIconName> = {
  // Social Media — the five the mockup draws, and the rest of the headline set.
  social_media_followers_at_month_end: "people",
  social_media_net_follower_growth: "person-plus",
  social_media_follower_growth: "person-plus",
  social_media_follows_gained: "person-plus",
  social_media_engagement_rate: "heart",
  social_media_likes_plus_comments: "heart",
  social_media_reach: "chart",
  social_media_reach_per_post: "chart",
  social_media_non_follower_reach: "chart",
  social_media_views: "eye",
  social_media_profile_visits: "pointer",
  social_media_saves: "bookmark",
  social_media_save_rate: "bookmark",
  social_media_shares: "share",
  social_media_share_rate: "share",
  social_media_posts_published: "notes",
  social_media_link_clicks: "pointer",
  social_media_dms_from_content: "email",

  // Financials.
  financials_total_revenue: "revenue",
  financials_revenue_from_offers: "revenue",
  financials_monthly_recurring_revenue: "revenue",
  financials_other_income: "revenue",
  financials_profit: "profit",
  financials_profit_margin: "profit",
  financials_total_costs: "calculator",
  financials_fixed_costs: "calculator",
  financials_variable_costs: "calculator",
  financials_team_costs: "people",
  financials_costs_as_percent_of_revenue: "calculator",
  financials_cash_in_bank_at_month_end: "revenue",
  financials_runway: "clock",
  financials_investment_spend: "calculator",

  // Leads & conversions.
  leads_conversions_total_leads: "leads",
  leads_conversions_new_clients: "person-plus",
  leads_conversions_calls_booked: "clock",
  leads_conversions_calls_held: "clock",
  leads_conversions_call_show_up_rate: "clock",
  leads_conversions_close_rate: "target",
  leads_conversions_lead_to_client_rate: "target",

  // Offers. The mockup's row is coins, a pie, a clock and a person; of
  // those the icon set has a clock, so the other three go to the nearest
  // thing it does have rather than to four new glyphs drawn for one row.
  offers_total_revenue_from_offers: "revenue",
  offers_overall_margin: "profit",
  offers_total_hours_spent_delivering: "clock",
  offers_overall_effective_hourly_rate: "target",
  offers_revenue_this_month: "revenue",
  offers_units_sold: "offers",
  offers_hours_spent_delivering: "clock",
  offers_margin: "profit",
  offers_effective_hourly_rate: "target",
  offers_delivery_cost: "calculator",
  offers_other_direct_costs: "calculator",

  // Email.
  email_list_size_at_month_end: "people",
  email_new_subscribers: "person-plus",
  email_net_list_growth: "person-plus",
  email_average_open_rate: "email",
  email_average_click_rate: "pointer",
  email_click_to_open_rate: "pointer",
  email_revenue_from_email: "revenue",
  email_revenue_per_subscriber: "revenue",
  email_sales_from_email: "revenue",
  email_emails_sent: "upload",
  email_unsubscribes: "people",
  email_unsubscribe_rate: "people",
};

/** A metric's mark, or its category's where it has none of its own. */
export function metricIcon(
  metricKey: string,
  categoryIcon: ReportIconName,
): ReportIconName {
  return METRIC_ICONS[metricKey] ?? categoryIcon;
}

/** Exposed for the test that walks the seeded metric list. */
export { METRIC_ICONS };
