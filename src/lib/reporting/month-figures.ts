import "server-only";

import { CATEGORIES, type CategoryKey } from "./categories.ts";
import {
  calculate,
  entityAwareLookup,
  offerResults,
  type FunnelMonth,
  type Lookup,
} from "./calculate.ts";
import type { AdCampaign, OfferMonth } from "./formulas.ts";
import {
  getClientFlow,
  getMetrics,
  getMonthData,
  type MonthData,
  type ReportMetric,
} from "./queries.ts";
import { activeClientsAtStart, openingFigures, type OpeningFigure } from "./client-flow.ts";
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
  /** The ad campaigns, with their goals, for the Ads screen (§5.7). */
  campaignRows: (AdCampaign & { id: string })[];
  /** The funnels, each with the price captured for this month (§5.5). */
  funnelRows: FunnelMonth[];
  /**
   * §5.8's opening figure: the one in use, and any others sitting unused.
   *
   * The unused ones are carried so the entry screen can say so. A figure
   * that is quietly ignored is worse than one that is wrong.
   */
  openingClients: { inUse: OpeningFigure | null; unused: OpeningFigure[] };
  byKey: Map<string, ReportMetric>;
}

function offerRowsFrom(data: MonthData, values: MonthData["values"]): OfferMonth[] {
  return data.entities
    .filter((e) => e.entity_type === "offer")
    .map((offer) => ({
      name: offer.name,
      hourlyCost: offer.hourly_cost,
      pricingModel: offer.pricing_model ?? undefined,
      unitsSold: values.get("offers_units_sold", offer.id),
      revenue: values.get("offers_revenue_this_month", offer.id),
      hoursSpent: values.get("offers_hours_spent_delivering", offer.id),
      otherDirectCosts: values.get("offers_other_direct_costs", offer.id),
    }))
    // An offer set up but not sold this month is not a zero row; it simply
    // has no figures, and including it would drag the weighted margin
    // towards a month it took no part in.
    .filter(
      (row) =>
        row.unitsSold !== null || row.revenue !== null || row.hoursSpent !== null,
    );
}

/**
 * Each campaign with its month's figures (§5.7).
 *
 * Every campaign set up, including the ones with nothing entered: a
 * campaign that spent nothing this month is still a row somebody may need
 * to give a goal to, and dropping it would hide it from the entry
 * screen's "no goal set" warning.
 */
function campaignRowsFrom(
  data: MonthData,
  values: MonthData["values"],
): (AdCampaign & { id: string })[] {
  return data.entities
    .filter((e) => e.entity_type === "ad_campaign")
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      goal: campaign.campaign_goal,
      spend: values.get("ads_spend", campaign.id),
      impressions: values.get("ads_impressions", campaign.id),
      linkClicks: values.get("ads_link_clicks", campaign.id),
      leads: values.get("ads_leads", campaign.id),
      purchases: values.get("ads_purchases", campaign.id),
      revenue: values.get("ads_revenue_from_ads", campaign.id),
    }));
}

function funnelRowsFrom(data: MonthData, values: MonthData["values"]): FunnelMonth[] {
  return data.entities
    .filter((e) => e.entity_type === "funnel")
    .map((funnel) => ({
      id: funnel.id,
      name: funnel.name,
      linkedOfferId: funnel.linked_offer_id,
      landingPageViews: values.get("funnels_landing_page_views", funnel.id),
      optIns: values.get("funnels_opt_ins", funnel.id),
      salesPageViews: values.get("funnels_sales_page_views", funnel.id),
      checkoutsStarted: values.get("funnels_checkouts_started", funnel.id),
      purchases: values.get("funnels_purchases", funnel.id),
      orderBumps: values.get("funnels_order_bumps_taken", funnel.id),
      upsells: values.get("funnels_upsells_taken", funnel.id),
      priceAtMonth: values.get("funnels_offer_price_at_month", funnel.id),
    }));
}

export async function getMonthFigures(ctx: ReportContext): Promise<MonthFigures> {
  const [metrics, data, flow] = await Promise.all([
    getMetrics(),
    getMonthData(ctx.workspace.id, ctx.month.month, ctx.month.previous),
    getClientFlow(ctx.workspace.id, ctx.month.month),
  ]);

  // §5.8. Both months, because the arrows on Client Experience compare
  // against last month and last month's start is as derived as this one's.
  const clientsAtStart = activeClientsAtStart(flow, ctx.month.month);
  const previousClientsAtStart = ctx.month.previous
    ? activeClientsAtStart(flow, ctx.month.previous)
    : null;

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

  const offerRows = offerRowsFrom(data, data.values);
  // Last month's offers, worked out the same way. Without these, every
  // figure derived from the offers — Revenue, Profit, the margin — had
  // nothing to compare against, and the Overview said "No month to
  // compare" on a month whose predecessor was full of figures.
  const previousOfferRows = offerRowsFrom(data, data.previous);
  const campaignRows = campaignRowsFrom(data, data.values);
  const funnelRows = funnelRowsFrom(data, data.values);
  const previousCampaignRows = campaignRowsFrom(data, data.previous);

  // Every category, so the Overview can read a figure from any of them.
  // `previous` for the previous month's own calculations is the month before
  // that, which is not loaded — so a rate that is itself defined against the
  // prior month has no arrow last month either. That is honest: we do not
  // have the figure, and inventing one would put an arrow on a comparison
  // that was never made.
  const results: Record<string, number | null> = {};
  const previousResults: Record<string, number | null> = {};
  for (const category of CATEGORIES) {
    Object.assign(
      results,
      calculate(category.key, {
        value,
        previous,
        offerRows,
        adCampaigns: campaignRows,
        clientsAtStart,
      }),
    );
    Object.assign(
      previousResults,
      calculate(category.key, {
        value: previous,
        previous: () => null,
        offerRows: previousOfferRows,
        adCampaigns: previousCampaignRows,
        clientsAtStart: previousClientsAtStart,
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
    campaignRows,
    funnelRows,
    openingClients: openingFigures(flow),
    byKey,
  };
}

/** Each offer with its own worked-out figures, for the Offers screen. */
export function offerBreakdown(figures: MonthFigures) {
  return offerResults(
    figures.offerRows,
    figures.results.offers_total_revenue_from_offers ?? null,
  );
}

/**
 * How much of a category's core is filled in, for "Still to fill in" (§8.1).
 *
 * Not simply `figure(key) !== null`. Offers stores its figures against each
 * offer, so a month-level lookup finds nothing and the category reads 0/3
 * however much has been entered — which is what it did for every client
 * until 2 October.
 *
 * For a category whose metrics hang off a row, a core metric counts as
 * filled when EVERY active row has it. Three offers with two of them priced
 * is not a finished section.
 */
export function categoryCompletion(
  figures: MonthFigures,
  category: CategoryKey,
): { filled: number; total: number } {
  const core = figures.metrics.filter(
    (m) => m.category === category && m.input_type === "core",
  );
  if (core.length === 0) return { filled: 0, total: 0 };

  const entityType = core[0].entity_type;
  // Offers is the only category that actually stores per row today. Social
  // Media's metrics carry an entity type as well, but there is exactly one
  // platform and `figure()` already resolves it.
  const rows =
    entityType === "offer"
      ? figures.data.entities.filter((e) => e.entity_type === "offer" && e.active)
      : null;

  if (!rows) {
    return { filled: core.filter((m) => figures.figure(m.key) !== null).length, total: core.length };
  }

  if (rows.length === 0) return { filled: 0, total: core.length };

  const filled = core.filter((m) =>
    rows.every((row) => figures.data.values.get(m.key, row.id) !== null),
  ).length;

  return { filled, total: core.length };
}
