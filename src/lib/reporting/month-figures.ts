import "server-only";

import { CATEGORIES, ENTRY_CATEGORIES, type CategoryKey } from "./categories.ts";
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
import { readCarried, type Carried } from "./carried.ts";
import {
  expensesThisMonth,
  forecastIn,
  receivedThisMonth,
  type ExpenseRow,
  type Received,
} from "./ledger.ts";
import { getSalesLedger, type SalesLedger } from "./sales-queries.ts";
import { getExpenseLedger, type ExpenseLedger } from "./expense-queries.ts";
import { monthIsLocked } from "./locked.ts";
import { ValueBag } from "./queries.ts";
import { choosePlatform, platformsOf, type PlatformRow } from "./platforms.ts";
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
  /** The snapshot this month was published with, or null on a draft. */
  carried: Carried | null;
  /** This month's figure, typed or derived. */
  figure: (metricKey: string) => number | null;
  /** Last month's, for the change. */
  previousFigure: (metricKey: string) => number | null;
  /**
   * The offers, with their setup, ready for the Offers screen.
   *
   * Carrying the entity's own `id` and `price` alongside the month's
   * figures, the way `campaignRows` does. The id is what lets the page
   * ask for an offer's history; the price is setup rather than arithmetic,
   * which is why neither belongs in `OfferMonth` itself — the formulas
   * must not be able to reach for them.
   */
  offerRows: (OfferMonth & { id: string; price: number | null })[];
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
  /**
   * The social platform these figures are for, and all of the live ones.
   *
   * Every Social Media figure hangs off a platform row, so "this month's
   * reach" is only a question once you know whose. The Overview passes
   * no `?platform=` and therefore reads the main one; Social Media's two
   * screens pass the pill's choice.
   */
  platform: PlatformRow | null;
  platforms: PlatformRow[];
  /**
   * The two grids, whole — Financials reads its revenue off them (§5.10).
   *
   * Carried here rather than read a second time by the screen: the entry
   * grid, the report's own figures and everything derived from them come
   * from one read and cannot be looking at two different answers.
   */
  ledger: SalesLedger;
  /** This month's money received, flattened against the rows it came in on. */
  received: Received[];
  /** The expense categories and every month's figures (§5.10). */
  expenses: ExpenseLedger;
  /**
   * How many cells the two Financials grids hold for this month, for
   * "still to fill in". Financials has no core metric left to count.
   */
  financialsCells: { received: number; costs: number };
  /**
   * Every platform's Social Media figures, worked out separately.
   *
   * The Overview's Focus areas and target bars judge each platform on
   * its own (Nina, 11 November), and a platform's calculated figures —
   * engagement rate, follower growth — cannot be read off another
   * platform's. No extra query: the rows are already loaded and this is
   * `calculate()` run once more per platform.
   */
  byPlatform: {
    platform: PlatformRow;
    figure: (metricKey: string) => number | null;
    previousFigure: (metricKey: string) => number | null;
  }[];
}

function offerRowsFrom(
  data: MonthData,
  values: MonthData["values"],
): (OfferMonth & { id: string; price: number | null })[] {
  return data.entities
    .filter((e) => e.entity_type === "offer")
    .map((offer) => ({
      id: offer.id,
      name: offer.name,
      price: offer.price,
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

/**
 * The four Offers figures that are about hours (Nina, 3 November).
 *
 * Hidden together or not at all: hours spent delivering, the effective
 * hourly rate it feeds, and the same two added up across every offer. A
 * client selling a product cannot answer the first, and the other three
 * are arithmetic on an answer nobody gave.
 *
 * **Delivery cost and margin are deliberately not here.** They are built
 * from hours AND from other direct costs, so they still mean something
 * with the hours switched off - less, but something - and removing a
 * client's margin because they do not track hours would take away more
 * than was asked for.
 */
export const OFFER_HOURS_METRICS = [
  "offers_hours_spent_delivering",
  "offers_effective_hourly_rate",
  "offers_total_hours_spent_delivering",
  "offers_overall_effective_hourly_rate",
] as const;

/**
 * The metric list with this client's switched-off figures taken out.
 *
 * **Exported because two places read metrics and neither may be the
 * only one that knows.** `getMonthFigures` feeds every report and entry
 * screen; the targets page reads `getMetrics()` straight, and without
 * this it would go on offering a target for an effective hourly rate
 * the client is never asked the hours for — a box that can be filled in
 * for a figure that is not drawn.
 */
export function visibleMetrics(
  metrics: ReportMetric[],
  workspace: { track_offer_hours: boolean },
): ReportMetric[] {
  if (workspace.track_offer_hours) return metrics;
  return metrics.filter((m) => !OFFER_HOURS_METRICS.includes(m.key as never));
}

export async function getMonthFigures(ctx: ReportContext): Promise<MonthFigures> {
  const [allMetrics, data, flow, ledger, expenses] = await Promise.all([
    getMetrics(),
    getMonthData(ctx.workspace.id, ctx.month.month, ctx.month.previous),
    getClientFlow(ctx.workspace.id, ctx.month.month),
    // §5.10's two grids. Read for every category, because the Overview's
    // Revenue card is Financials' figure and this is where it comes from.
    getSalesLedger(ctx.workspace.id),
    // And the third grid: the four cost totals are its buckets' sums.
    getExpenseLedger(ctx.workspace.id),
  ]);

  /**
   * The hours figures come out here rather than on each screen, so the
   * switch cannot be honoured by the Offers page and forgotten by the
   * Overview, the overflow list, the entry screen or a CSV. **Display
   * only**: the rows stay in `report_values` and come back untouched
   * when the switch goes back on, the same promise `hidden_categories`
   * makes about a whole section.
   */
  const metrics = visibleMetrics(allMetrics, ctx.workspace);

  /**
   * On a published month, everything that comes from OTHER months comes
   * from the snapshot instead (decision 3, `docs/freeze-plan.md`).
   *
   * The same predicate as the lock — published, and a retainer — so the
   * month that cannot be edited is exactly the month that is not
   * recomputed. Editors included: Nina and the client see the same report,
   * which is §9's rule, and the live view she wants while correcting is
   * the draft view, which she gets by unpublishing.
   *
   * Null means no snapshot: a draft, or a month published before the
   * backfill. Both fall back to the live walk, which is what they did
   * before this existed.
   */
  const carried = monthIsLocked(ctx.workspace, data.period?.published_at)
    ? readCarried(data.period?.carried)
    : null;

  // §5.8. Both months, because the arrows on Client Experience compare
  // against last month and last month's start is as derived as this one's.
  const clientsAtStart = carried
    ? carried.clientsAtStart
    : activeClientsAtStart(flow, ctx.month.month);
  const previousClientsAtStart = carried
    ? carried.previousClientsAtStart
    : ctx.month.previous
      ? activeClientsAtStart(flow, ctx.month.previous)
      : null;

  // The previous month's figures, as they stood when this month went out.
  // Rebuilt into a ValueBag so every reader below is unchanged — the one
  // thing that differs is where the numbers came from.
  const previousValues = carried
    ? new ValueBag(
        Object.entries(carried.previous).map(([key, value]) => {
          const sep = key.lastIndexOf("|");
          return {
            metric_key: key.slice(0, sep),
            entity_id: key.slice(sep + 1) || null,
            value,
            source: "manual" as const,
          };
        }),
      )
    : data.previous;

  // The row labels and the settings that change a number. A campaign's
  // goal decides whose spend counts towards cost per lead (§10.2), and an
  // offer's price is what potential revenue multiplies by, so both belong
  // to the report as much as any figure in it.
  const entities = carried
    ? data.entities.map((e) => {
        const frozen = carried.entities[e.id];
        if (!frozen) return e;
        return {
          ...e,
          name: frozen.name,
          campaign_goal: frozen.goal as typeof e.campaign_goal,
          // A snapshot written before 11 November has no price in it, and
          // a month published then must go on showing the price it showed
          // rather than a dash. Absent is not null.
          price: frozen.price === undefined ? e.price : frozen.price,
        };
      })
    : data.entities;
  const frozen = { ...data, previous: previousValues, entities };

  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const metricEntityType = new Map(metrics.map((m) => [m.key, m.entity_type]));

  // Which entity holds a given kind of figure. Social Media's hang off
  // the platform on screen — the main one unless the pill says otherwise
  // (11 November); offers, funnels and campaigns are addressed per row
  // instead, so they have no single answer and are read directly.
  const platform = choosePlatform(frozen.entities, ctx.platformRequested);
  const platforms = platformsOf(frozen.entities);
  const entityFor = (entityType: string) =>
    entityType === "social_platform" ? (platform?.id ?? null) : null;

  const value: Lookup = entityAwareLookup(
    (key, entityId) => frozen.values.get(key, entityId),
    metricEntityType,
    entityFor,
  );
  const previous: Lookup = entityAwareLookup(
    (key, entityId) => frozen.previous.get(key, entityId),
    metricEntityType,
    entityFor,
  );

  /**
   * What came in this month, and what came in last month.
   *
   * **Last month's comes from the snapshot on a published month**, the
   * same rule every other cross-month figure follows: the arrow on a
   * published Revenue card must not move because somebody edited an
   * earlier month that is still a draft. Absent is not empty — a month
   * published before this existed has no key, and falls back to the live
   * read rather than suddenly showing a dash.
   */
  const received = receivedThisMonth(ledger.rows, ledger.actuals, ctx.month.month);
  const previousReceived =
    carried?.previousReceived ??
    (ctx.month.previous
      ? receivedThisMonth(ledger.rows, ledger.actuals, ctx.month.previous)
      : []);

  // The four cost totals, and last month's for the arrows beside them.
  // Frozen the same way, for the same reason: Profit's "up from" is
  // arithmetic over a month that may still be a draft.
  // What the forecast says for this month, and for the month before it.
  // Read live on both: a forecast cell for a published month is held
  // still by the same lock every other figure in it wears.
  const expected = forecastIn(ledger.forecasts, ctx.month.month);
  const previousExpected = ctx.month.previous
    ? forecastIn(ledger.forecasts, ctx.month.previous)
    : null;

  const costs: ExpenseRow[] = expensesThisMonth(expenses.expenses, ctx.month.month);
  const previousCosts =
    carried?.previousCosts ??
    (ctx.month.previous ? expensesThisMonth(expenses.expenses, ctx.month.previous) : []);

  const offerRows = offerRowsFrom(frozen, frozen.values);
  // Last month's offers, worked out the same way. Without these, every
  // figure derived from the offers — Revenue, Profit, the margin — had
  // nothing to compare against, and the Overview said "No month to
  // compare" on a month whose predecessor was full of figures.
  const previousOfferRows = offerRowsFrom(frozen, frozen.previous);
  const campaignRows = campaignRowsFrom(frozen, frozen.values);
  const funnelRows = funnelRowsFrom(frozen, frozen.values);
  const previousCampaignRows = campaignRowsFrom(frozen, frozen.previous);

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
        received,
        costs,
        expected,
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
        received: previousReceived,
        costs: previousCosts,
        expected: previousExpected,
      }),
    );
  }

  /**
   * One platform's Social Media figures, typed and calculated.
   *
   * Everything outside Social Media is passed through unchanged — the
   * offer rows and the client flow are the month's, not a platform's —
   * so this differs from the main pass in exactly one thing: which
   * platform row the lookups resolve to.
   */
  const socialFigures = (platformId: string) => {
    const bound = (entityType: string) =>
      entityType === "social_platform" ? platformId : null;
    const mine = entityAwareLookup(
      (key, entityId) => frozen.values.get(key, entityId),
      metricEntityType,
      bound,
    );
    const mineBefore = entityAwareLookup(
      (key, entityId) => frozen.previous.get(key, entityId),
      metricEntityType,
      bound,
    );
    const now = calculate("social_media", {
      value: mine,
      previous: mineBefore,
      offerRows,
      adCampaigns: campaignRows,
      clientsAtStart,
    });
    const before = calculate("social_media", {
      value: mineBefore,
      previous: () => null,
      offerRows: previousOfferRows,
      adCampaigns: previousCampaignRows,
      clientsAtStart: previousClientsAtStart,
    });
    return {
      figure: (key: string) => (key in now ? now[key] : (mine(key) ?? null)),
      previousFigure: (key: string) => (key in before ? before[key] : (mineBefore(key) ?? null)),
    };
  };

  const byPlatform = platforms.map((row) => ({ platform: row, ...socialFigures(row.id) }));

  const figure = (metricKey: string): number | null =>
    metricKey in results ? results[metricKey] : value(metricKey) ?? null;

  const previousFigure = (metricKey: string): number | null =>
    metricKey in previousResults
      ? previousResults[metricKey]
      : previous(metricKey) ?? null;

  return {
    metrics,
    data: frozen,
    carried,
    results,
    previousResults,
    figure,
    previousFigure,
    platform,
    platforms,
    byPlatform,
    offerRows,
    campaignRows,
    funnelRows,
    ledger,
    received,
    expenses,
    financialsCells: { received: received.length, costs: costs.length },
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

export { categoryCompletion } from "./completion.ts";
import { categoryCompletion } from "./completion.ts";
import type { CompletionInput, SectionState } from "./completion.ts";
export type { SectionState } from "./completion.ts";


/**
 * Where every entry section stands, for the entry screen's tab markers and
 * its "6 of 10 sections complete" bar (the mockups, and brief §3).
 *
 * Built on `categoryCompletion`, the same function the Overview's "Still to
 * fill in" panel uses, so the two can never disagree about whether a section
 * is finished — which they would within a week if each counted for itself.
 *
 * **A section with nothing in it to fill is finished, not excluded.** A
 * member with no funnels and no ad campaigns owes those sections nothing,
 * and counting them as outstanding meant they could never reach the end
 * however much they typed. That rule is already in the Overview panel; this
 * is the same rule, read from the same place.
 */
export function sectionStates(
  figures: CompletionInput,
  hidden: string[],
): {
  states: Partial<Record<CategoryKey, SectionState>>;
  done: number;
  total: number;
} {
  const states: Partial<Record<CategoryKey, SectionState>> = {};
  let done = 0;
  let total = 0;

  for (const category of ENTRY_CATEGORIES) {
    if (hidden.includes(category.key)) continue;
    total++;

    const { filled, total: count } = categoryCompletion(figures, category.key);

    if (count === 0 || filled === count) {
      states[category.key] = "done";
      done++;
    } else {
      states[category.key] = filled > 0 ? "started" : "empty";
    }
  }

  return { states, done, total };
}
