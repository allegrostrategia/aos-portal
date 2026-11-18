import type { CategoryKey } from "./categories.ts";
import type { Unit } from "./format.ts";
import type { IconTone, ReportIconName } from "@/components/reporting/icons";
import { platformSetFor } from "./platform-metrics.ts";
import type { PlatformKind } from "./platforms.ts";

/**
 * The month-by-month charts each screen draws, as data.
 *
 * Declared rather than written out page by page, for the same reason the
 * entry screens are generated from the metric list: a chart is a title, an
 * icon, a span, a unit and one or two metric keys, and thirteen of those
 * written by hand would be thirteen chances to put a percentage on a
 * currency axis.
 *
 * **Every chart here holds one unit.** Two series share an axis only when
 * they share a unit — revenue and profit are both money, reach and views
 * are both counts, save rate and share rate are both rates. There is no way
 * to express a second scale in this shape, deliberately: a dual axis lets
 * any two lines be drawn crossing wherever the author wants them to.
 *
 * Twelve months where the question is a trajectory (is the list growing?)
 * and six where it is a recent comparison (how did reach move this half
 * year?) — which is what the mockups put in each chart's own dropdown.
 * The dropdown itself is not built: the span is the one the mockup opens
 * on, and a control that re-queries would be the first client JavaScript
 * on these pages.
 */

export interface TrendSeriesSpec {
  metricKey: string;
  label: string;
}

export interface TrendChartSpec {
  /** Stable, for the React key and for a test to name one. */
  id: string;
  title: string;
  icon: ReportIconName;
  tone: IconTone;
  /** How many months back, including the month being reported on. */
  months: number;
  /** A line per series, or a bar per series per month. */
  kind: "line" | "bars";
  unit: Unit;
  series: TrendSeriesSpec[];
  /**
   * Fill under the line. Single-series charts only — two overlapping
   * washes make a third colour that means nothing.
   */
  area?: boolean;
  /**
   * Draw this metric's target as a dashed reference line, where the client
   * has set one. No target set, no line: an invented one would be a goal
   * nobody agreed to.
   */
  targetFor?: string;
  caption: string;
  /** Said instead of the chart when there are fewer than two months. */
  emptyMessage: string;
}

export const TREND_CHARTS: Partial<Record<CategoryKey, TrendChartSpec[]>> = {
  overview: [
    {
      id: "revenue-vs-profit",
      title: "Revenue vs profit",
      icon: "revenue",
      tone: "gold",
      months: 12,
      kind: "line",
      unit: "currency",
      series: [
        { metricKey: "financials_total_revenue", label: "Revenue" },
        { metricKey: "financials_profit", label: "Profit" },
      ],
      caption: "The last twelve months. A month with nothing entered is a gap, not a zero.",
      emptyMessage:
        "Two months of figures are needed before there is a trend to draw. This will fill in as the months go by.",
    },
  ],
  social_media: [
    {
      id: "followers-over-time",
      title: "Followers over time",
      icon: "people",
      tone: "sky",
      months: 12,
      kind: "line",
      unit: "count",
      series: [{ metricKey: "social_media_followers_at_month_end", label: "Followers" }],
      area: true,
      targetFor: "social_media_followers_at_month_end",
      caption: "Followers at the end of each month.",
      emptyMessage:
        "Two months of follower counts are needed before there is a line to draw.",
    },
    {
      id: "reach-and-views",
      title: "Reach and views",
      icon: "chart",
      tone: "orange",
      months: 6,
      kind: "bars",
      unit: "count",
      series: [
        { metricKey: "social_media_reach", label: "Reach" },
        { metricKey: "social_media_views", label: "Views" },
      ],
      caption: "The last six months. Views are not a part of reach, so the bars sit side by side.",
      emptyMessage: "No reach or views entered for these months yet.",
    },
    {
      id: "save-rate-vs-share-rate",
      title: "Save rate vs share rate",
      icon: "bookmark",
      tone: "blush",
      months: 6,
      kind: "line",
      unit: "percent",
      series: [
        { metricKey: "social_media_save_rate", label: "Save rate" },
        { metricKey: "social_media_share_rate", label: "Share rate" },
      ],
      caption: "The last six months.",
      emptyMessage:
        "Two months of save and share rates are needed before there is a trend to draw.",
    },
  ],
  financials: [
    {
      id: "revenue-vs-costs",
      title: "Revenue and costs",
      icon: "calculator",
      tone: "blush",
      months: 12,
      kind: "bars",
      unit: "currency",
      series: [
        { metricKey: "financials_total_revenue", label: "Revenue" },
        { metricKey: "financials_total_costs", label: "Costs" },
      ],
      caption: "The last twelve months. The gap between the two is the profit.",
      emptyMessage: "Two months of figures are needed before there is a comparison to draw.",
    },
  ],
};

/**
 * Which figures are cards at the top of a category's report.
 *
 * **Financials only, and by name.** Everywhere else the rule — the first
 * six figures this month has, in the metric list's own order — gives the
 * right six. On Financials it gave Revenue from offers, Revenue from
 * clients and the three cost buckets, so Profit and the margin, which are
 * what a P&L is read for, sat in the overflow panel underneath a donut
 * already showing the buckets (13 November).
 *
 * A category not named here keeps the general rule.
 */
/**
 * Figures a category's own panels already draw, kept out of "Everything
 * else this month".
 *
 * Dom, 13 November: the four cost buckets were in the overflow list
 * underneath a donut whose three slices were those same figures, with
 * the same numbers beside them. The panel is for what has nowhere else
 * to go on the page.
 *
 * All four, not the three that happen to have a figure today —
 * Investment spend is a slice of that donut the moment somebody enters
 * one, and leaving it out of this list would mean the bug came back on
 * the first month a client spent something on a course.
 */
export const DRAWN_ELSEWHERE: Partial<Record<CategoryKey, string[]>> = {
  financials: [
    // **MRR is the recurring chart now** (Nina, 15 November). A single
    // monthly recurring figure is this month's recurring total sitting
    // beside eleven other figures about this month, and it says nothing
    // about whether the retainers are still there in February — which
    // is the only question MRR is ever asked. "Confirmed recurring
    // revenue" draws four months of it instead.
    "financials_monthly_recurring_revenue",
    "financials_fixed_costs",
    "financials_variable_costs",
    "financials_team_costs",
    "financials_investment_spend",
  ],
};

export const HEADLINE_METRICS: Partial<Record<CategoryKey, string[]>> = {
  financials: [
    "financials_total_revenue",
    "financials_money_expected",
    "financials_total_costs",
    "financials_profit",
    "financials_profit_margin",
    "financials_cash_in_bank_at_month_end",
  ],
};

/**
 * Social Media's charts, where a platform's own figures need their own
 * chart (§5.2's per-platform sets, Nina 16 November).
 *
 * `chartsFor` starts from the three declared above, keeps the ones whose
 * every series is a figure this kind is asked for, and then applies
 * these. **A chart here REPLACES an inherited one of the same id**,
 * which is how YouTube's "Subscribers over time" takes the place of
 * "Followers over time" rather than appearing beside it — it is the same
 * chart of the same metric under the word YouTube uses.
 *
 * Instagram and "Other" have no entry: the three general charts are
 * theirs, and were written for Instagram in the first place.
 */
export const PLATFORM_TREND_CHARTS: Partial<Record<PlatformKind, TrendChartSpec[]>> = {
  linkedin: [
    {
      id: "impressions-and-members",
      title: "Impressions and members reached",
      icon: "chart",
      tone: "orange",
      months: 6,
      kind: "bars",
      unit: "count",
      series: [
        { metricKey: "social_media_impressions", label: "Impressions" },
        { metricKey: "social_media_members_reached", label: "Members reached" },
      ],
      caption:
        "The last six months. One counts times shown and the other counts people, so the bars sit side by side.",
      emptyMessage: "No impressions or members reached entered for these months yet.",
    },
    {
      id: "engagement-and-clicks",
      title: "Engagement rate vs click-through rate",
      icon: "pointer",
      tone: "blush",
      months: 6,
      kind: "line",
      unit: "percent",
      series: [
        { metricKey: "social_media_engagement_rate", label: "Engagement rate" },
        { metricKey: "social_media_click_through_rate", label: "Click-through rate" },
      ],
      caption: "The last six months. Both are measured against impressions.",
      emptyMessage:
        "Two months of engagement and click-through rates are needed before there is a trend to draw.",
    },
  ],
  tiktok: [
    {
      id: "video-views",
      title: "Video views",
      icon: "chart",
      tone: "orange",
      months: 6,
      kind: "bars",
      unit: "count",
      series: [{ metricKey: "social_media_video_views", label: "Video views" }],
      caption: "The last six months.",
      emptyMessage: "No video views entered for these months yet.",
    },
    {
      id: "engagement-and-favourites",
      title: "Engagement rate vs favourite rate",
      icon: "bookmark",
      tone: "blush",
      months: 6,
      kind: "line",
      unit: "percent",
      series: [
        { metricKey: "social_media_engagement_rate", label: "Engagement rate" },
        { metricKey: "social_media_favourite_rate", label: "Favourite rate" },
      ],
      caption: "The last six months. A favourite is TikTok's save.",
      emptyMessage:
        "Two months of engagement and favourite rates are needed before there is a trend to draw.",
    },
  ],
  facebook: [
    {
      id: "reach-and-engagements",
      title: "Reach and post engagements",
      icon: "chart",
      tone: "orange",
      months: 6,
      kind: "bars",
      unit: "count",
      series: [
        { metricKey: "social_media_reach", label: "Reach" },
        { metricKey: "social_media_post_engagements", label: "Post engagements" },
      ],
      caption: "The last six months.",
      emptyMessage: "No reach or post engagements entered for these months yet.",
    },
    {
      id: "engagement-and-clicks",
      title: "Engagement rate vs click-through rate",
      icon: "pointer",
      tone: "blush",
      months: 6,
      kind: "line",
      unit: "percent",
      series: [
        { metricKey: "social_media_engagement_rate", label: "Engagement rate" },
        { metricKey: "social_media_click_through_rate", label: "Click-through rate" },
      ],
      caption: "The last six months. Both are measured against reach.",
      emptyMessage:
        "Two months of engagement and click-through rates are needed before there is a trend to draw.",
    },
  ],
  youtube: [
    {
      // Replaces the inherited chart of the same figure: subscribers is
      // the word, and the metric underneath is the same one.
      id: "followers-over-time",
      title: "Subscribers over time",
      icon: "people",
      tone: "sky",
      months: 12,
      kind: "line",
      unit: "count",
      series: [{ metricKey: "social_media_followers_at_month_end", label: "Subscribers" }],
      area: true,
      targetFor: "social_media_followers_at_month_end",
      caption: "Subscribers at the end of each month.",
      emptyMessage:
        "Two months of subscriber counts are needed before there is a line to draw.",
    },
    /**
     * **Views and impressions were one chart and should not have been**
     * (Dom, 18 November, off the demo). A click-through rate of around
     * 6% means impressions are about fifteen times views, so on a
     * shared axis the views were slivers a reader could not see — a
     * chart of two numbers that only showed one of them. Two measures
     * of different scale is the dual-axis problem wearing a disguise,
     * and the answer is two charts rather than two scales.
     *
     * The relationship between them is not lost: the click-through
     * rate below IS views over impressions, and it is the figure
     * YouTube Studio reports and Nina would quote.
     */
    {
      id: "views-over-time",
      title: "Views over time",
      icon: "eye",
      tone: "orange",
      months: 6,
      kind: "bars",
      unit: "count",
      series: [{ metricKey: "social_media_views", label: "Views" }],
      caption: "The last six months.",
      emptyMessage: "No views entered for these months yet.",
    },
    {
      id: "click-through-rate",
      title: "Click-through rate",
      icon: "target",
      tone: "blush",
      months: 12,
      kind: "line",
      unit: "percent",
      // The TYPED one. YouTube counts a view differently from an
      // impression-click, so its own figure and a worked-out one would
      // disagree on the same page — settled by Nina on 16 November,
      // and the reason there are two click-through-rate metrics at all.
      series: [
        { metricKey: "social_media_reported_click_through_rate", label: "Click-through rate" },
      ],
      area: true,
      caption:
        "How often a thumbnail somebody saw was one they opened, as YouTube Studio reports it.",
      emptyMessage:
        "Two months of click-through rates are needed before there is a line to draw.",
    },
    {
      id: "watch-time",
      title: "Watch time",
      icon: "clock",
      tone: "gold",
      months: 12,
      kind: "line",
      unit: "hours",
      series: [{ metricKey: "social_media_watch_time", label: "Watch time" }],
      area: true,
      caption: "Hours watched each month — the figure YouTube itself judges a channel on.",
      emptyMessage: "Two months of watch time are needed before there is a line to draw.",
    },
  ],
};

/**
 * A category's charts, narrowed to the platform on screen.
 *
 * Only Social Media has anything to narrow: every other category's
 * figures belong to the month. A general chart survives when the kind is
 * asked for every figure it draws — so LinkedIn keeps the follower line
 * and loses "Save rate vs share rate", which would otherwise be a
 * confident title over an empty panel on a platform that has no saves.
 */
export function chartsFor(
  category: CategoryKey,
  kind: PlatformKind | null = null,
): TrendChartSpec[] {
  const declared = TREND_CHARTS[category] ?? [];
  if (category !== "social_media") return declared;

  const asked = new Set(platformSetFor(kind).keys);
  const byId = new Map(
    declared
      .filter((chart) => chart.series.every((s) => asked.has(s.metricKey)))
      .map((chart) => [chart.id, chart] as const),
  );
  for (const chart of (kind && PLATFORM_TREND_CHARTS[kind]) ?? []) {
    byId.set(chart.id, chart);
  }
  return [...byId.values()];
}

/** Every metric key a category's charts need, with no duplicates. */
export function trendMetricKeys(
  category: CategoryKey,
  kind: PlatformKind | null = null,
): string[] {
  const keys = chartsFor(category, kind).flatMap((chart) =>
    chart.series.map((s) => s.metricKey),
  );
  return [...new Set(keys)];
}

/** The longest span any of a category's charts asks for. */
export function trendMonthsNeeded(
  category: CategoryKey,
  kind: PlatformKind | null = null,
): number {
  return Math.max(0, ...chartsFor(category, kind).map((chart) => chart.months));
}
