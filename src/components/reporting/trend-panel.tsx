import { Card, SectionTitle } from "@/components/ui/card";
import { GroupedBarChart } from "./charts/grouped-bar-chart";
import { TrendChart } from "./charts/trend-chart";
import { IconCircle } from "./icons";
import { formatValue } from "@/lib/reporting/format";
import type { TrendChartSpec } from "@/lib/reporting/trends";

/**
 * One of `TREND_CHARTS`' charts, drawn.
 *
 * The panel rather than the page knows how a spec becomes a chart, so the
 * Overview and the category pages cannot draw the same spec two ways.
 *
 * `history` is keyed by metric key and every array is the length of
 * `months` — `alignToMonths` guarantees it — so the page loads ONE span and
 * every chart on it reads the same rows.
 *
 * **The spec's own span is taken here, from both at once.** A six-month
 * chart beside a twelve-month one is the tail of the same arrays, and
 * slicing the axis in the page while leaving the points alone would have
 * drawn twelve months of figures under six month labels — the points would
 * have been right and every one of them in the wrong place.
 */
export function TrendPanel({
  spec,
  history,
  months,
  currency,
  target,
  columns = 1,
}: {
  spec: TrendChartSpec;
  history: Map<string, (number | null)[]>;
  /**
   * Short labels for the whole span the page loaded — "Oct", "Nov" —
   * oldest first. The chart takes the last `spec.months` of it.
   */
  months: string[];
  currency: string;
  /** The client's target for `spec.targetFor`, where they have set one. */
  target?: number | null;
  /**
   * How many charts share this row. A chart in a three-across row is
   * drawn with a narrower viewBox so its axis labels scale up instead of
   * down — at 640 units in a 330px card they come out at about 5px.
   */
  columns?: 1 | 2 | 3;
}) {
  const from = Math.max(0, months.length - spec.months);
  const axis = months.slice(from);
  const series = spec.series.map((s) => ({
    label: s.label,
    points: (history.get(s.metricKey) ?? months.map(() => null)).slice(from),
  }));

  return (
    <Card>
      <SectionTitle icon={<IconCircle name={spec.icon} tone={spec.tone} />}>
        {spec.title}
      </SectionTitle>
      {spec.kind === "bars" ? (
        <GroupedBarChart
          series={series}
          months={axis}
          unit={spec.unit}
          currency={currency}
          caption={spec.caption}
          emptyMessage={spec.emptyMessage}
          narrow={columns > 1}
        />
      ) : (
        <TrendChart
          series={series}
          months={axis}
          unit={spec.unit}
          currency={currency}
          area={spec.area}
          target={spec.targetFor ? (target ?? null) : null}
          targetLabel={
            spec.targetFor && target !== null && target !== undefined
              ? `Target ${formatValue(target, spec.unit, currency)}`
              : undefined
          }
          caption={spec.caption}
          emptyMessage={spec.emptyMessage}
          narrow={columns > 1}
        />
      )}
    </Card>
  );
}
