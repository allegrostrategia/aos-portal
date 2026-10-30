import type { CategoryKey } from "./categories.ts";
import type { Unit } from "./format.ts";
import type { IconTone, ReportIconName } from "@/components/reporting/icons";

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
};

/** Every metric key a category's charts need, with no duplicates. */
export function trendMetricKeys(category: CategoryKey): string[] {
  const keys = (TREND_CHARTS[category] ?? []).flatMap((chart) =>
    chart.series.map((s) => s.metricKey),
  );
  return [...new Set(keys)];
}

/** The longest span any of a category's charts asks for. */
export function trendMonthsNeeded(category: CategoryKey): number {
  return Math.max(0, ...(TREND_CHARTS[category] ?? []).map((chart) => chart.months));
}
