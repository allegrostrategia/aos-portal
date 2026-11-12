import { formatValue } from "./format.ts";
import { bespokeRevenue, forecastAfter, offerRevenue } from "./ledger.ts";
import { monthLabel } from "./months.ts";
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
    .map(({ offer, results }, index) => {
      const rate = results.offers_effective_hourly_rate ?? null;
      return {
        label: offer.name,
        value: rate,
        display: formatValue(rate, "currency", currency),
        // The offer's own position, carried past the sort below so the
        // bar keeps the colour its slice has in the donut on the same
        // screen. Sorting is what made this necessary: by rank, the
        // colours would reshuffle whenever two offers swapped places.
        colorIndex: index,
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
/**
 * Where the month's money came from: each offer, and one slice for
 * everything else.
 *
 * **Not the Offers donut.** That one draws the revenue typed per offer
 * on the Offers screen and totals that screen's own figure. This draws
 * the Actual grid — what landed — so its total is the month's revenue
 * and the card above it says the same number (§9).
 *
 * **One bespoke slice, not forty** (§5.10). Linking a row to an offer is
 * optional and an agency has dozens of bespoke clients; a slice each
 * would turn a chart about offers into a client list nobody can read.
 * So everything unlinked is one slice with its client count beside it,
 * and who is in it is the per-client card's job.
 *
 * A row linked to an offer that has since been retired keeps its money
 * in the chart under the offer's name: the entity is still there, and
 * dropping it would make the donut stop totalling the month.
 */
export function revenueFromWhere(
  figures: MonthFigures,
  month: string,
  currency: string,
): Slice[] {
  const byOffer = offerRevenue(figures.ledger.rows, figures.ledger.actuals, month);
  const offers = figures.data.entities.filter((e) => e.entity_type === "offer");

  const slices: Slice[] = offers
    .map((offer, index) => ({
      label: offer.name,
      value: byOffer.get(offer.id) ?? 0,
      display: formatValue(byOffer.get(offer.id) ?? 0, "currency", currency),
      // The entity's own position, so an offer that earns nothing one
      // month and something the next keeps its colour in both.
      colorIndex: index,
    }))
    .filter((s) => s.value > 0);

  const bespoke = bespokeRevenue(figures.ledger.rows, figures.ledger.actuals, month);
  if ((bespoke.total ?? 0) > 0) {
    /**
     * **What the slice is called depends on what is in it.**
     *
     * The brief's case is client rows: retainers and bespoke work, one
     * slice with its client count. But a row can be an offer the client
     * never linked to the Offers screen, and calling that "bespoke
     * work" beside a card reading "Revenue from offers" would be the
     * page disagreeing with itself in words. The split on this chart is
     * the offer LINK, because a slice is an offer; the split on the
     * cards is the row's KIND. Where the two differ, the label says
     * which one this is.
     */
    const linked = new Set(
      figures.ledger.rows.filter((r) => r.offerEntityId !== null).map((r) => r.id),
    );
    const inSlice = figures.ledger.rows.filter(
      (r) =>
        !linked.has(r.id) &&
        figures.ledger.actuals.some((c) => c.salesRowId === r.id && c.month === month),
    );
    const allClients = inSlice.every((r) => r.rowType === "client");
    const count = bespoke.clients;

    slices.push({
      label: allClients
        ? `Bespoke work · ${count} ${count === 1 ? "client" : "clients"}`
        : `Not linked to an offer · ${count} ${count === 1 ? "row" : "rows"}`,
      value: bespoke.total ?? 0,
      display: formatValue(bespoke.total, "currency", currency),
      colorIndex: offers.length,
    });
  }

  return slices;
}

/**
 * What the rest of the year is forecast at, month by month.
 *
 * **Frozen on a published month** (`Carried.forecastAhead`). It is the
 * only forward-looking figure on the report, so live it would move a
 * published September every time somebody revised November — and
 * reading it live would mean a client's RLS had to hand them months
 * they have not been shown. Absent is not empty: a month published
 * before 13 November has no key at all and falls back to the live read,
 * which is what it did before the freeze existed.
 *
 * Months with no forecast at all are left out rather than drawn as
 * zero: nobody said that month would earn nothing.
 */
export function forecastAhead(
  figures: MonthFigures,
  month: string,
  currency: string,
): BarDatum[] {
  const ahead =
    figures.carried?.forecastAhead ?? forecastAfter(figures.ledger.forecasts, month);

  return ahead
    .filter((row) => row.amount !== 0)
    .map((row) => ({
      label: monthLabel(row.month).split(" ")[0],
      value: row.amount,
      display: formatValue(row.amount, "currency", currency),
    }));
}

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
