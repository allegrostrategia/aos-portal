import "server-only";

import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, type CategoryKey } from "./categories.ts";
import { calculate, entityAwareLookup, type Lookup } from "./calculate.ts";
import { ValueBag } from "./queries.ts";
import { alignToMonths } from "./history.ts";
import { previousMonthOf } from "./months.ts";
import type { AdCampaign, OfferMonth } from "./formulas.ts";
import type { ReportEntity, ReportMetric } from "./queries.ts";

/**
 * Several months of a workspace's figures — **including the worked-out ones.**
 *
 * **Why this is not just a query.** `report_values` holds what somebody
 * typed, and the four most interesting things on these charts are not typed
 * at all. Total revenue, profit, save rate and share rate are all `calc`
 * metrics: they are worked out from other figures every time a screen asks,
 * and the database has never held a row for any of them. Reading them from
 * `report_values` returns nothing, forever — so "Revenue vs profit", the
 * chart at the top of the mockup's Overview, would have been an empty panel
 * with a confident title on it, and the first two KPI cards would have had
 * no sparkline on any client's report ever. Found by checking `input_type`
 * before trusting the query, not by looking at a blank chart.
 *
 * So this loads the INPUTS for a span of months, splits them month by month,
 * and runs the same `calculate()` the page runs — the one in `formulas.ts`,
 * through the same `entityAwareLookup`. §9's rule holds across time as well
 * as across screens: there is one implementation of profit, and a point on a
 * chart is the same arithmetic as the figure on the card.
 *
 * **One month further back than asked for.** Several formulas are defined
 * against the previous month — net follower growth is this month's count
 * minus last month's — so the oldest month on the chart needs the month
 * before it loaded or its first point would be a dash for a reason the
 * reader cannot see.
 *
 * **What a client sees is still RLS's decision.** Every read goes through
 * their own session, so a retainer client gets their published months and a
 * draft November is simply not in the rows — a gap on the chart, which is
 * honest, rather than a figure they were not meant to read. And because a
 * published month is read-only (`monthIsLocked`), the history behind their
 * chart is as fixed as the figures on the card above it.
 */

/**
 * The raw keys one category's `calculate()` reads, discovered by running it.
 *
 * A hand-written list of dependencies is the kind that drifts: somebody adds
 * `v("social_media_follows_gained")` to a formula and the chart quietly
 * loses a month. `Lookup` is just a function, so passing one that records
 * what it is asked for and answers null gives the exact set, from the
 * implementation rather than from a note about it.
 *
 * Entity-level figures are not in here — `offers` and `ads` read theirs off
 * the rows rather than through the lookup, which is why they come back with
 * no inputs at all and why `ENTITY_KEYS` below exists.
 */
export function inputKeysFor(category: CategoryKey): string[] {
  const seen = new Set<string>();
  const record: Lookup = (key) => {
    seen.add(key);
    return null;
  };

  calculate(category, {
    value: record,
    previous: record,
    offerRows: [],
    adCampaigns: [],
    clientsAtStart: null,
    totalRevenue: null,
  });

  return [...seen];
}

/**
 * The per-row figures, which no lookup is asked for.
 *
 * `offerRowsFrom` and `campaignRowsFrom` read these off each entity
 * directly, so the recorder above cannot see them. Listed here, and the
 * list is checked rather than trusted: `supabase/tests/figure-history.test.mjs`
 * asserts that the newest point of every series equals what the page's own
 * `getMonthFigures` renders for that month, so a key missing from here
 * shows up as a figure that disagrees with the card above the chart.
 */
const ENTITY_KEYS: Record<"offer" | "ad_campaign", string[]> = {
  offer: [
    "offers_units_sold",
    "offers_revenue_this_month",
    "offers_hours_spent_delivering",
    "offers_other_direct_costs",
  ],
  ad_campaign: [
    "ads_spend",
    "ads_impressions",
    "ads_link_clicks",
    "ads_leads",
    "ads_purchases",
    "ads_revenue_from_ads",
  ],
};

/** Which entity kinds a category's figures hang off. */
const ENTITIES_NEEDED: Partial<Record<CategoryKey, ("offer" | "ad_campaign")[]>> = {
  // Revenue is pulled from the offers, so profit is too.
  financials: ["offer"],
  offers: ["offer"],
  // "New leads from ads" is summed over the campaigns, never typed.
  leads_conversions: ["ad_campaign"],
  ads: ["ad_campaign"],
};

/**
 * As `RawValue` declares it. `numeric` can arrive as a string and
 * `ValueBag` normalises it at the boundary, which is the one place that
 * has to know.
 */
interface RawRow {
  month: string;
  metric_key: string;
  entity_id: string | null;
  value: number | null;
}

export async function getFigureHistory({
  workspaceId,
  months,
  metricKeys,
  metrics,
}: {
  workspaceId: string;
  /** The axis, oldest first, as `monthsEndingAt` builds it. */
  months: string[];
  /** The metrics wanted back, stored or worked out. */
  metricKeys: string[];
  /** The metric list, for each key's category and whether it is calculated. */
  metrics: ReportMetric[];
}): Promise<Map<string, (number | null)[]>> {
  if (metricKeys.length === 0 || months.length === 0) {
    return alignToMonths([], metricKeys, months);
  }

  const byKey = new Map(metrics.map((m) => [m.key, m]));

  // Which categories have to be worked out, rather than read. A requested
  // key that is not in the metric list is treated as stored, which is the
  // safe way round: it costs one key in the query and cannot invent a
  // figure.
  const calcCategories = new Set<CategoryKey>(
    metricKeys
      .map((key) => byKey.get(key))
      .filter((m) => m && m.input_type !== "core" && m.input_type !== "optional")
      .map((m) => m!.category),
  );

  /**
   * Everything to load: every key asked for, plus the inputs of every
   * category that has to be worked out.
   *
   * **Every key asked for, not only the stored ones.** The first version
   * left a requested key out whenever its category also had a calc metric
   * in the set, trusting `inputKeysFor` to put it back — and it does, for
   * anything a formula reads. `social_media_views` is read by no formula,
   * so on a page that also wanted save rate it was silently never loaded
   * and "Reach and views" drew its empty state with real figures sitting
   * in the database. Asking for a calc key here costs one entry in an
   * `in (…)` list and returns no rows, which is the cheap side to be
   * wrong on.
   */
  const monthLevelKeys = new Set<string>(metricKeys);
  const entityKinds = new Set<"offer" | "ad_campaign">();
  for (const category of calcCategories) {
    for (const key of inputKeysFor(category)) monthLevelKeys.add(key);
    for (const kind of ENTITIES_NEEDED[category] ?? []) entityKinds.add(kind);
  }
  const perRowKeys = new Set<string>();
  for (const kind of entityKinds) {
    for (const key of ENTITY_KEYS[kind]) perRowKeys.add(key);
  }

  const from = previousMonthOf(months[0]);
  const to = months[months.length - 1];

  /**
   * **Two value queries, not one, because of §13's 1,000-row cap.**
   *
   * PostgREST caps a read and says nothing about having done it, so a
   * query that goes over does not fail — it comes back short and the
   * chart draws whatever survived. Thirteen months multiplies every
   * count by thirteen, which is the kind of thing that is fine on Test
   * Client and wrong on the first client with a full year of ads.
   *
   * The arithmetic, worst case, for the Overview — the heaviest page:
   *
   *   · month level: about 40 keys (eight asked for, plus the inputs of
   *     four calc categories) × 13 months ≈ 520 rows;
   *   · per row: six ad keys × say eight campaigns × 13 ≈ 620, plus four
   *     offer keys × six offers × 13 ≈ 310.
   *
   * Together that is over the cap on a busy client. Split, neither half
   * is close, and each one is doing a different job anyway: the first
   * reads figures addressed by month, the second figures addressed by
   * row.
   */
  const supabase = await createClient();
  const [valueResult, perRowResult, entityResult] = await Promise.all([
    supabase
      .from("report_values")
      .select("month, metric_key, entity_id, value")
      .eq("workspace_id", workspaceId)
      .in("metric_key", [...monthLevelKeys])
      .gte("month", from)
      .lte("month", to)
      .returns<RawRow[]>(),
    perRowKeys.size > 0
      ? supabase
          .from("report_values")
          .select("month, metric_key, entity_id, value")
          .eq("workspace_id", workspaceId)
          .in("metric_key", [...perRowKeys])
          .gte("month", from)
          .lte("month", to)
          .returns<RawRow[]>()
      : Promise.resolve({ data: [] as RawRow[] }),
    // **Every entity, not only the kinds the calc categories named.**
    // Social Media's figures hang off a `social_platform` row, so a
    // month-level lookup for followers finds nothing and the whole
    // category comes back as dashes — which is exactly what the first
    // run of the agreement test showed, and the same bug the entry card
    // had on 6 October. There are a handful of entities per workspace;
    // this is one small query, not a saving worth making.
    supabase
      .from("report_entities")
      .select("*")
      .eq("workspace_id", workspaceId)
      .returns<ReportEntity[]>(),
  ]);

  const rows = [...(valueResult.data ?? []), ...(perRowResult.data ?? [])];
  const entities = entityResult.data ?? [];

  // One bag per month, including the extra month at the front, so a
  // formula defined against "last month" has one to read.
  const bags = new Map<string, ValueBag>();
  for (const month of [from, ...months]) {
    bags.set(
      month,
      new ValueBag(
        rows
          .filter((r) => r.month === month)
          .map((r) => ({ ...r, source: "manual" as const })),
      ),
    );
  }

  const metricEntityType = new Map(metrics.map((m) => [m.key, m.entity_type]));
  // Only one social platform exists in this build, so it has a single
  // answer; offers, funnels and campaigns are addressed per row.
  const platformId = entities.find((e) => e.entity_type === "social_platform")?.id ?? null;
  const entityFor = (entityType: string) =>
    entityType === "social_platform" ? platformId : null;

  const lookupFor = (month: string): Lookup => {
    const bag = bags.get(month);
    return entityAwareLookup(
      (key, entityId) => bag?.get(key, entityId) ?? null,
      metricEntityType,
      entityFor,
    );
  };

  const offerRowsFor = (month: string): OfferMonth[] => {
    const bag = bags.get(month);
    return entities
      .filter((e) => e.entity_type === "offer")
      .map((offer) => ({
        name: offer.name,
        hourlyCost: offer.hourly_cost,
        pricingModel: offer.pricing_model ?? undefined,
        unitsSold: bag?.get("offers_units_sold", offer.id) ?? null,
        revenue: bag?.get("offers_revenue_this_month", offer.id) ?? null,
        hoursSpent: bag?.get("offers_hours_spent_delivering", offer.id) ?? null,
        otherDirectCosts: bag?.get("offers_other_direct_costs", offer.id) ?? null,
      }))
      // The same filter the page uses: an offer set up but not sold this
      // month is not a zero row, and including it would drag a weighted
      // figure towards a month it took no part in.
      .filter(
        (row) => row.unitsSold !== null || row.revenue !== null || row.hoursSpent !== null,
      );
  };

  const campaignRowsFor = (month: string): AdCampaign[] => {
    const bag = bags.get(month);
    return entities
      .filter((e) => e.entity_type === "ad_campaign")
      .map((campaign) => ({
        name: campaign.name,
        goal: campaign.campaign_goal,
        spend: bag?.get("ads_spend", campaign.id) ?? null,
        impressions: bag?.get("ads_impressions", campaign.id) ?? null,
        linkClicks: bag?.get("ads_link_clicks", campaign.id) ?? null,
        leads: bag?.get("ads_leads", campaign.id) ?? null,
        purchases: bag?.get("ads_purchases", campaign.id) ?? null,
        revenue: bag?.get("ads_revenue_from_ads", campaign.id) ?? null,
      }));
  };

  const wanted = new Set(metricKeys);
  const series = new Map<string, (number | null)[]>(
    metricKeys.map((key) => [key, months.map(() => null)]),
  );

  months.forEach((month, at) => {
    const value = lookupFor(month);
    const previous = lookupFor(previousMonthOf(month));
    const offerRows = offerRowsFor(month);
    const adCampaigns = campaignRowsFor(month);

    const results: Record<string, number | null> = {};
    for (const category of CATEGORIES) {
      // Only the categories something was asked of. `client_experience`
      // in particular needs an opening-clients walk this does not do, and
      // running it here would put a figure on a chart that the page would
      // disagree with.
      if (!calcCategories.has(category.key)) continue;
      Object.assign(
        results,
        calculate(category.key, { value, previous, offerRows, adCampaigns }),
      );
    }

    for (const key of wanted) {
      const figure = key in results ? results[key] : value(key);
      series.get(key)![at] = figure ?? null;
    }
  });

  return series;
}
