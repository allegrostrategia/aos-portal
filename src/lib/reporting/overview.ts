import type { CategoryKey } from "./categories.ts";

/**
 * The six KPI cards on the Overview (§5.1), and where each one comes from.
 *
 * "Each pulls from its own category" — so this is a list of metric keys, not
 * a set of sums. Three of them are calculated rather than typed, which is why
 * the Overview has to run `calculate()` across every category before it can
 * draw its own top row.
 *
 * Defined once so the card, its arrow and any target bar against it all read
 * the same figure.
 */
export interface OverviewKpi {
  /** The metric whose figure the card shows. */
  metricKey: string;
  /** The category it belongs to, so the card can link to that page. */
  category: CategoryKey;
  /** The mockup's wording, which is shorter than the metric's own label. */
  label: string;
}

export const OVERVIEW_KPIS: OverviewKpi[] = [
  { metricKey: "financials_total_revenue", category: "financials", label: "Revenue" },
  { metricKey: "financials_profit", category: "financials", label: "Profit" },
  { metricKey: "leads_conversions_total_leads", category: "leads_conversions", label: "New Leads" },
  { metricKey: "leads_conversions_new_clients", category: "leads_conversions", label: "New Clients" },
  { metricKey: "email_list_size_at_month_end", category: "email", label: "Email List Size" },
  { metricKey: "social_media_followers_at_month_end", category: "social_media", label: "Followers" },
];
