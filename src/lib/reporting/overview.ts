import type { CategoryKey } from "./categories.ts";
import type { ReportIconName } from "@/components/reporting/icons";

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
  /**
   * The mockup's wording, which is shorter than the metric's own label.
   *
   * Sentence case (Nina, 30 Oct): it sits beside the icon as a label, not
   * above the card as a tracked eyebrow, and Title Case on a six-across
   * grid made every two-word label look like a heading.
   */
  label: string;
  /**
   * The mark on the card, from the mockups. Decorative: the label beside it
   * says the same thing in words, so the icon carries nothing on its own.
   */
  icon: ReportIconName;
}

export const OVERVIEW_KPIS: OverviewKpi[] = [
  { metricKey: "financials_total_revenue", category: "financials", label: "Revenue", icon: "revenue" },
  { metricKey: "financials_profit", category: "financials", label: "Profit", icon: "profit" },
  { metricKey: "leads_conversions_total_leads", category: "leads_conversions", label: "New leads", icon: "leads" },
  { metricKey: "leads_conversions_new_clients", category: "leads_conversions", label: "New clients", icon: "person-plus" },
  // "Email list", not "Email list size" (Dom, 30 October): six across, a
  // card has about 115px beside the 40px disc, and the longer wording was
  // the one label that wrapped to a second line and made its card taller
  // than the five beside it.
  { metricKey: "email_list_size_at_month_end", category: "email", label: "Email list", icon: "email" },
  { metricKey: "social_media_followers_at_month_end", category: "social_media", label: "Followers", icon: "people" },
];
