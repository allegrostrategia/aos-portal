import { formatValue } from "./format.ts";
import { offerResults } from "./calculate.ts";
import type { MonthFigures } from "./month-figures.ts";
import type { BarDatum } from "@/components/reporting/charts/bar-chart";
import type { Slice } from "@/components/reporting/charts/donut-chart";

/**
 * The numbers each chart draws, worked out in one place.
 *
 * **Nothing here recomputes a figure.** Every value comes from
 * `MonthFigures` — which is `calculate()` and `calculateOffer()` from the
 * formula module — so a chart and the card beside it cannot disagree. That
 * is Dom's condition for the hourly-rate chart (5 Oct) and it is the right
 * rule for all five: the moment a screen does its own arithmetic there are
 * two answers to the same question and no way to tell which is on the
 * client's report.
 *
 * Pure and separate from the components, so the values can be tested
 * without rendering anything.
 */

/** The five lead sources of §5.6, in the order the metric list seeds them. */
const LEAD_SOURCES = [
  { key: "leads_conversions_new_leads_from_social", label: "Social" },
  { key: "leads_conversions_new_leads_from_email", label: "Email" },
  { key: "leads_conversions_new_leads_from_ads", label: "Ads" },
  { key: "leads_conversions_new_leads_from_referral", label: "Referral" },
  { key: "leads_conversions_new_leads_from_other", label: "Other" },
] as const;

/**
 * Leads by source, biggest first.
 *
 * A source with nothing entered is left out rather than drawn as a zero: a
 * client who runs no ads should not read a chart that says their ads
 * produced nothing. A source entered as a genuine 0 stays, because that is
 * an answer (§4).
 */
export function leadsBySource(figures: MonthFigures): BarDatum[] {
  return LEAD_SOURCES.map(({ key, label }) => ({
    label,
    value: figures.figure(key),
    display: formatValue(figures.figure(key), "count"),
  }))
    .filter((d) => d.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/**
 * Share of revenue by offer (§5.9).
 *
 * **In the offers' own order, not biggest first.** The colour is taken from
 * the position, so sorting by size would hand an offer a different colour
 * the month it overtook another — and a client comparing two months would
 * see their biggest offer change colour for no reason. It also means the
 * legend reads in the same order as the table underneath it.
 *
 * The colour index comes from the full list, before the offers with no
 * revenue are dropped, so an offer that earns nothing in September and
 * something in October keeps the same colour in both.
 */
export function revenueByOffer(figures: MonthFigures, currency: string): Slice[] {
  return offersOf(figures)
    .map(({ offer }, index) => ({
      label: offer.name,
      value: offer.revenue ?? 0,
      display: formatValue(offer.revenue, "currency", currency),
      colorIndex: index,
    }))
    .filter((s) => s.value > 0);
}

/**
 * Effective hourly rate by offer, with the offers that cannot have one.
 *
 * **(Revenue − other direct costs) ÷ hours**, and read from
 * `offers_effective_hourly_rate` rather than worked out here — Dom's
 * correction of 5 Oct, after the first plan had it as revenue ÷ hours.
 * Labour cost is not deducted, which is the whole point of the figure: it
 * answers "what is an hour of this worth", not "what is left after paying
 * ourselves".
 *
 * An offer with no hours entered keeps its row and says so. Nina's answer,
 * 5 Oct: in the legend as "hours not entered", no bar. Dropping it would
 * quietly shorten the chart and hide the gap.
 */
export function hourlyRateByOffer(
  figures: MonthFigures,
  currency: string,
): BarDatum[] {
  return offersOf(figures)
    .map(({ offer, results }) => {
      const rate = results.offers_effective_hourly_rate ?? null;
      return {
        label: offer.name,
        value: rate,
        display: formatValue(rate, "currency", currency),
        missingNote:
          offer.hoursSpent === null || offer.hoursSpent === undefined
            ? "hours not entered"
            : "not worked out",
      };
    })
    // An offer with neither a rate nor a reason is nothing to show.
    .filter((d) => d.value !== null || d.missingNote === "hours not entered")
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

/** The four cost lines of §5.10. */
const COST_LINES = [
  { key: "financials_fixed_costs", label: "Fixed" },
  { key: "financials_variable_costs", label: "Variable" },
  { key: "financials_team_costs", label: "Team" },
  { key: "financials_investment_spend", label: "Investment" },
] as const;

/**
 * The four cost lines, always in the same order and always the same colour.
 *
 * The index is the line's own position, not its position after the empty
 * ones are dropped: a month with no team costs must not turn Variable into
 * the colour Team had last month.
 */
export function costBreakdown(figures: MonthFigures, currency: string): Slice[] {
  return COST_LINES.map(({ key, label }, index) => {
    const value = figures.figure(key);
    return {
      label,
      value: value ?? 0,
      display: formatValue(value, "currency", currency),
      colorIndex: index,
    };
  }).filter((s) => s.value > 0);
}

/**
 * The offers of a month, each with the formula module's own results.
 *
 * Here rather than inline in three builders so the two arguments are read
 * off the figures in one place — and so this file depends on the pure
 * calculate layer rather than on anything that talks to the database.
 */
function offersOf(figures: MonthFigures) {
  return offerResults(
    figures.offerRows,
    figures.results.offers_total_revenue_from_offers ?? null,
  );
}
