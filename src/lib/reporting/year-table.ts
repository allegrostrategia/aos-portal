import { formatValue } from "./format.ts";
import type { ReportMetric } from "./queries.ts";
import type { Unit as ReportUnit } from "./format.ts";

/**
 * "Your year, month by month" — the page's figures as rows, Jan to Dec.
 *
 * **Nina's finance spreadsheet, on every page** (15 November). A report
 * page answers "how was this month"; the thing she reads a tracker for
 * is the shape of the year, and that is a grid, not a chart. Charts
 * show you a line is rising. A grid lets you find the month it stopped.
 *
 * January to December of the month being read, not the last twelve
 * months. A calendar year is what a year total means, and a client
 * comparing their report to their accounts is comparing calendar years.
 * A month with nothing in it is blank, never a zero — the same rule the
 * charts follow, because "we had no reach in March" and "nobody typed
 * March in" are different statements.
 */

export interface YearRow {
  key: string;
  label: string;
  unit: ReportUnit;
  /** Twelve cells, January first. Null is "not entered". */
  values: (number | null)[];
  /** The year's total or average, and which it is. */
  summary: { value: number | null; kind: "total" | "average" };
}

/** The twelve months of the calendar year a month belongs to. */
export function calendarYear(month: string): string[] {
  const year = Number(month.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
}

/**
 * Totalled, or averaged where a total would be nonsense.
 *
 * **A year of percentages does not add up.** Twelve months of a 40%
 * open rate is not 480% — it is 40%, and the same goes for a margin, a
 * conversion rate or an hourly rate. Counts, money and hours add; rates
 * and ratios average over the months that have a figure, so a client
 * who started in June is not averaged against five blank months.
 */
export function summarise(unit: ReportUnit, values: (number | null)[]): YearRow["summary"] {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return { value: null, kind: averaged(unit) ? "average" : "total" };

  if (averaged(unit)) {
    return { value: present.reduce((a, b) => a + b, 0) / present.length, kind: "average" };
  }
  return { value: present.reduce((a, b) => a + b, 0), kind: "total" };
}

function averaged(unit: ReportUnit): boolean {
  return unit === "percent" || unit === "ratio" || unit === "months";
}

/**
 * A figure whose year total would be a lie, whatever its unit.
 *
 * "Followers at month end" is a count, and adding twelve months of it
 * gives a number thirty times the size of the audience. Anything that
 * is a level rather than a flow takes its last reading instead — which
 * is what a year-end figure means for a balance.
 */
const LEVELS = /_at_month_end$|_at_start|^offers_price|_list_size/;

/**
 * The same, for the figures that hang off a row rather than a month.
 *
 * **Funnels drew nothing at all without this** (15 November). Every one
 * of its figures belongs to a funnel, and a month-level read came back
 * empty under a confident title — the exact failure the history loader
 * exists to prevent, reproduced one layer up. Ads and Offers were
 * showing their month-level totals and none of the per-row figures
 * that are most of those pages.
 *
 * One row per entity per figure, named "<entity> — <figure>", because
 * "Opt-ins" twice with different numbers is not a table anybody can
 * read. Grouped by entity rather than by figure so a reader follows one
 * funnel down the page.
 */
export function buildEntityYearRows(
  metrics: ReportMetric[],
  entities: { id: string; name: string }[],
  /** metric key → entity id → twelve values. */
  history: Map<string, Map<string, (number | null)[]>>,
): YearRow[] {
  const rows: YearRow[] = [];
  for (const entity of entities) {
    for (const metric of metrics) {
      const values = history.get(metric.key)?.get(entity.id) ?? new Array(12).fill(null);
      if (!values.some((v) => v !== null)) continue;
      rows.push({
        key: `${metric.key}:${entity.id}`,
        label: `${entity.name} — ${metric.label}`,
        unit: metric.unit as ReportUnit,
        values,
        summary: LEVELS.test(metric.key)
          ? { value: lastReading(values), kind: "total" as const }
          : summarise(metric.unit as ReportUnit, values),
      });
    }
  }
  return rows;
}

export function buildYearRows(
  metrics: ReportMetric[],
  history: Map<string, (number | null)[]>,
): YearRow[] {
  return metrics
    .map((metric) => {
      const values = history.get(metric.key) ?? new Array(12).fill(null);
      const summary = LEVELS.test(metric.key)
        ? { value: lastReading(values), kind: "total" as const }
        : summarise(metric.unit as ReportUnit, values);
      return { key: metric.key, label: metric.label, unit: metric.unit as ReportUnit, values, summary };
    })
    // A row with nothing in it all year is not worth twelve blank cells.
    .filter((row) => row.values.some((v) => v !== null));
}

function lastReading(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

/** What the summary column is called for a row. */
export function summaryLabel(row: YearRow): string {
  if (LEVELS.test(row.key.split(":")[0])) return "Latest";
  return row.summary.kind === "average" ? "Average" : "Total";
}

export const formatCell = (value: number | null, unit: ReportUnit, currency: string) =>
  value === null ? "—" : formatValue(value, unit, currency);
