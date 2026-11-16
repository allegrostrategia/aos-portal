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
  /** Which way is good, so a fall in costs reads green (Nina, 16 Nov). */
  goodDirection: "up" | "down" | "none";
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
 * A figure whose year total would be a lie: a level, not a flow.
 *
 * "Followers at month end" is a count, and adding twelve months of it
 * gives a number thirty times the size of the audience. Same for a
 * balance, a list size, a price, a run rate and a runway — each is a
 * reading taken at a moment, so the year's answer is the last one, not
 * the sum and not the average.
 *
 * **Named, not matched on a pattern.** It was a regex on the key, and
 * it missed four: monthly recurring revenue (summed to twelve times the
 * run rate), active clients at end, runway, and an offer's price that
 * month. Whether a figure is a level is a judgement about what it
 * means, and a naming convention is not where that judgement lives —
 * `financials_monthly_recurring_revenue` looks like every other
 * currency figure. The test below fails if one of these keys stops
 * existing, so a rename cannot quietly drop a figure back to being
 * summed. (Nina, 16 November, from a year cell reading £94,400 of MRR.)
 */
export const LEVEL_METRICS = new Set([
  "social_media_followers_at_month_end",
  "email_list_size_at_month_end",
  "financials_cash_in_bank_at_month_end",
  "financials_monthly_recurring_revenue",
  "financials_runway",
  "client_experience_active_clients_at_start",
  "client_experience_active_clients_at_end",
  "client_experience_clients_at_start_opening",
  "funnels_offer_price_at_month",
]);

const isLevel = (key: string) => LEVEL_METRICS.has(key.split(":")[0]);

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
        goodDirection: metric.good_direction,
        values,
        summary: isLevel(metric.key)
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
      const summary = isLevel(metric.key)
        ? { value: lastReading(values), kind: "total" as const }
        : summarise(metric.unit as ReportUnit, values);
      return {
        key: metric.key,
        label: metric.label,
        unit: metric.unit as ReportUnit,
        goodDirection: metric.good_direction,
        values,
        summary,
      };
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
  if (isLevel(row.key)) return "Latest";
  return row.summary.kind === "average" ? "Average" : "Total";
}

/**
 * The Financials split (Nina, 16 November).
 *
 * Revenue, costs, profit and the margin are the four lines a P&L is
 * read for, and in one table of fifteen rows they were four rows among
 * eleven. They get their own card at the top; everything else — the
 * cost buckets included — stays in the main table underneath.
 */
export const HEADLINE_YEAR_ROWS: Partial<Record<string, string[]>> = {
  financials: [
    "financials_total_revenue",
    "financials_total_costs",
    "financials_profit",
    "financials_profit_margin",
  ],
};

export function splitYearRows(
  category: string,
  rows: YearRow[],
): { headline: YearRow[]; rest: YearRow[] } {
  const wanted = HEADLINE_YEAR_ROWS[category];
  if (!wanted) return { headline: [], rest: rows };
  const headline = wanted
    .map((key) => rows.find((r) => r.key === key))
    .filter((r): r is YearRow => !!r);
  return { headline, rest: rows.filter((r) => !headline.includes(r)) };
}

/**
 * **Whole pounds in the year grid** (Nina, 16 November). Twelve columns
 * of "£590.77" is two characters of noise per cell and it is what was
 * pushing December into the Year column. Pence stay everywhere else, on
 * the cards and in the CSV, where one month's exact figure is the
 * point.
 */
export const formatCell = (value: number | null, unit: ReportUnit, currency: string) =>
  value === null
    ? "—"
    : formatValue(unit === "currency" ? Math.round(value) : value, unit, currency);
