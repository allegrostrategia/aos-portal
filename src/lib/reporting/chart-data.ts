import { formatValue } from "./format.ts";
import { bespokeRevenue, confirmedRecurring, forecastAfter } from "./ledger.ts";
import { monthLabel } from "./months.ts";
import { offerResults } from "./calculate.ts";
import { callWinRows, callWinTotals } from "./call-wins.ts";
import type { MonthFigures } from "./month-figures.ts";
import type { BarDatum } from "@/components/reporting/charts/bar-chart";
import type { Slice } from "@/components/reporting/charts/donut-chart";
import type { FunnelStage } from "@/components/reporting/charts/funnel-chart";

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
 * The month's funnel: leads, calls booked, calls held, won (§5.6).
 *
 * Nina, 16 November: "a funnel (leads → calls booked → held → won)". Each
 * step is a subset of the one above it, which is what the narrowing shape
 * measures — and the reason this is a funnel rather than four bars.
 *
 * **"Won" is calls converted, not new clients.** New clients counts
 * everybody who started this month however they arrived, so a client who
 * bought from a sales page without ever being on a call would widen the
 * bottom of a funnel they were never in. The two figures are usually close
 * and the difference is exactly the part this chart must not swallow.
 *
 * A step with nothing entered is listed and not drawn, which is the
 * component's own rule — a missing figure is not a zero.
 */
export function callFunnel(figures: MonthFigures): FunnelStage[] {
  return [
    { label: "Leads", value: figures.figure("leads_conversions_total_leads") },
    { label: "Calls booked", value: figures.figure("leads_conversions_calls_booked") },
    { label: "Calls held", value: figures.figure("leads_conversions_calls_held") },
    { label: "Won", value: figures.figure("leads_conversions_calls_converted") },
  ];
}

/**
 * What the calls bought (§5.6) — the value of each line, biggest first.
 *
 * The value rather than the count, because "what they bought" is a question
 * about where the month's money was won and two sales of a £4,000 programme
 * are not the same news as two of a £49 workshop. The count is in the table
 * beside it, where it can be read without being ranked.
 *
 * `colorIndex` is the line's own position in the list, carried past the
 * sort, so an offer keeps its colour when it overtakes another — the same
 * rule the Offers page's bars follow.
 *
 * **The bespoke line is one of the bars**, not a footnote. For an agency
 * client it is often the biggest thing on the chart, and a breakdown that
 * drew only the offers would be answering a narrower question than the
 * title asks.
 */
export function winsByOffer(figures: MonthFigures, currency: string): BarDatum[] {
  return callWinRows(figures.callWins, figures.bespokeWins)
    .map((row, index) => ({
      label: row.name,
      value: row.value,
      display: formatValue(row.value, "currency", currency),
      colorIndex: index,
      // Sold something, and nothing to value it at: an offer with no price.
      // It earned something; we have no price to say what (§4, Dom 5 Oct).
      missingNote: "no price set",
    }))
    .filter((d) => d.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/** What the breakdown comes to, for the card's heading. */
export function winsTotal(figures: MonthFigures): number {
  return callWinTotals(callWinRows(figures.callWins, figures.bespokeWins)).value;
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
export function revenueByOffer(
  figures: MonthFigures,
  currency: string,
  /**
   * The month, so the slice for everything not linked to an offer can
   * be worked out. Given, the donut totals the month's revenue; left
   * out, it is the offers alone — which is what every caller wanted
   * before 13 November.
   */
  month?: string,
): Slice[] {
  const offers = offersOf(figures).map(({ offer }, index) => ({
    label: offer.name,
    value: offer.revenue ?? 0,
    display: formatValue(offer.revenue, "currency", currency),
    colorIndex: index,
  }));

  const slices = offers.filter((s) => s.value > 0);
  if (!month) return slices;

  /**
   * **And one slice for everything else** (§5.10, and the brief says it
   * belongs on this chart). Linking a row to an offer is optional and
   * an agency has dozens of bespoke clients; a slice each would turn a
   * chart about offers into a client list nobody can read. So the rest
   * is one slice with its count, and the donut totals the month.
   */
  const rest = restOfTheMonth(figures, month, currency, offers.length);
  return rest ? [...slices, rest] : slices;
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
function restOfTheMonth(
  figures: MonthFigures,
  month: string,
  currency: string,
  colorIndex: number,
): Slice | null {
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

    return {
      label: allClients
        ? `Bespoke work · ${count} ${count === 1 ? "client" : "clients"}`
        : `Not linked to an offer · ${count} ${count === 1 ? "row" : "rows"}`,
      value: bespoke.total ?? 0,
      display: formatValue(bespoke.total, "currency", currency),
      colorIndex,
    };
  }

  return null;
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

/**
 * Recurring money already committed, this month and the next three.
 *
 * **It replaces the MRR card** (Nina, 15 November): one figure for this
 * month's recurring total is true and unplaceable — it says nothing
 * about whether the retainers are still there in February, which is the
 * only reason anybody looks at MRR. Four bars answer the question the
 * figure was standing in for.
 *
 * The current month is marked, because it is the one bar that may be
 * money already in rather than money expected, and a chart that mixes
 * the two without saying so is the kind of thing a client quotes back.
 */
export function confirmedRecurringAhead(
  figures: MonthFigures,
  month: string,
  currency: string,
): BarDatum[] {
  const ledger = figures.ledger;
  return confirmedRecurring(ledger.rows, ledger.forecasts, ledger.actuals, month).map((row) => ({
    label: monthLabel(row.month).split(" ")[0],
    value: row.amount,
    display: formatValue(row.amount, "currency", currency),
    missingNote: row.month === month ? "this month" : undefined,
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
