import "server-only";

import { CATEGORIES } from "./categories.ts";
import { calculate, calculateOffer, entityAwareLookup, type Lookup } from "./calculate.ts";
import type { OfferMonth } from "./formulas.ts";
import { getMetrics, getMonthData, type MonthData, type ReportMetric } from "./queries.ts";
import type { ReportContext } from "./context.ts";

/**
 * One month, worked out — the single thing every report screen reads from.
 *
 * Both the entry screen's live card and the report go through `calculate()`,
 * which is what §9 asks for. This is the server-side half: it loads the
 * month, works out every calculated figure in every category, and hands back
 * one function that answers "what is this metric, this month" whether the
 * answer was typed or derived.
 *
 * Assembled once per page rather than per card, because the Overview alone
 * reads six metrics from three different categories and each of those needs
 * the whole category's inputs to work itself out.
 */

export interface MonthFigures {
  metrics: ReportMetric[];
  data: MonthData;
  /** Every calculated figure this month, keyed by metric. */
  results: Record<string, number | null>;
  /** The same for last month, so cards can show their arrows. */
  previousResults: Record<string, number | null>;
  /** This month's figure, typed or derived. */
  figure: (metricKey: string) => number | null;
  /** Last month's, for the change. */
  previousFigure: (metricKey: string) => number | null;
  /** The offers, with their setup, ready for the Offers screen. */
  offerRows: OfferMonth[];
  byKey: Map<string, ReportMetric>;
}

function offerRowsFrom(data: MonthData): OfferMonth[] {
  return data.entities
    .filter((e) => e.entity_type === "offer")
    .map((offer) => ({
      name: offer.name,
      hourlyCost: offer.hourly_cost,
      pricingModel: offer.pricing_model ?? undefined,
      unitsSold: data.values.get("offers_units_sold", offer.id),
      revenue: data.values.get("offers_revenue_this_month", offer.id),
      hoursSpent: data.values.get("offers_hours_spent_delivering", offer.id),
      otherDirectCosts: data.values.get("offers_other_direct_costs", offer.id),
    }))
    // An offer set up but not sold this month is not a zero row; it simply
    // has no figures, and including it would drag the weighted margin
    // towards a month it took no part in.
    .filter(
      (row) =>
        row.unitsSold !== null || row.revenue !== null || row.hoursSpent !== null,
    );
}

export async function getMonthFigures(ctx: ReportContext): Promise<MonthFigures> {
  const [metrics, data] = await Promise.all([
    getMetrics(),
    getMonthData(ctx.workspace.id, ctx.month.month, ctx.month.previous),
  ]);

  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const metricEntityType = new Map(metrics.map((m) => [m.key, m.entity_type]));

  // Which entity holds a given kind of figure. Only one platform exists in
  // this build; offers, funnels and campaigns are addressed per row instead,
  // so they have no single answer and are read directly.
  const platformId =
    data.entities.find((e) => e.entity_type === "social_platform")?.id ?? null;
  const entityFor = (entityType: string) =>
    entityType === "social_platform" ? platformId : null;

  const value: Lookup = entityAwareLookup(
    (key, entityId) => data.values.get(key, entityId),
    metricEntityType,
    entityFor,
  );
  const previous: Lookup = entityAwareLookup(
    (key, entityId) => data.previous.get(key, entityId),
    metricEntityType,
    entityFor,
  );

  const offerRows = offerRowsFrom(data);

  // Every category, so the Overview can read a figure from any of them.
  // `previous` for the previous month's own calculations is the month before
  // that, which is not loaded — so a rate that is itself defined against the
  // prior month has no arrow last month either. That is honest: we do not
  // have the figure, and inventing one would put an arrow on a comparison
  // that was never made.
  const results: Record<string, number | null> = {};
  const previousResults: Record<string, number | null> = {};
  for (const category of CATEGORIES) {
    Object.assign(results, calculate(category.key, { value, previous, offerRows }));
    Object.assign(
      previousResults,
      calculate(category.key, {
        value: previous,
        previous: () => null,
        offerRows: [],
      }),
    );
  }

  const figure = (metricKey: string): number | null =>
    metricKey in results ? results[metricKey] : value(metricKey) ?? null;

  const previousFigure = (metricKey: string): number | null =>
    metricKey in previousResults
      ? previousResults[metricKey]
      : previous(metricKey) ?? null;

  return {
    metrics,
    data,
    results,
    previousResults,
    figure,
    previousFigure,
    offerRows,
    byKey,
  };
}

/** Each offer with its own worked-out figures, for the Offers screen. */
export function offerBreakdown(figures: MonthFigures) {
  const total = figures.results.offers_total_revenue_from_offers ?? null;
  return figures.offerRows.map((offer) => ({
    offer,
    results: calculateOffer(offer, total),
  }));
}
