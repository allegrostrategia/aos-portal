/**
 * Several months of one workspace's figures, lined up on a calendar.
 *
 * Pure and separate from the query, for the same reason `chart-data.ts` is:
 * the alignment is where this goes wrong — a month missed, a month drawn
 * twice, a metric's points sliding one place because an earlier month had
 * nothing in it — and none of those need a database to catch.
 *
 * **What a client sees here is already decided by RLS.** `report_values`
 * answers through `report_can_read_month`, so a retainer client gets their
 * published months and nothing else, and a draft November simply is not in
 * the rows. That is the right shape for a chart: an unpublished month is a
 * gap, which is honest, rather than a figure they were not meant to read.
 *
 * **And a published month cannot move under it.** `monthIsLocked` makes a
 * published month read-only, so the history behind a client's chart is as
 * fixed as the figures on the card above it. This is why the trend does not
 * need the `carried` snapshot the month-on-month comparison needs: the
 * snapshot exists because a figure was derived from other months, and every
 * point here belongs to the month it is drawn in.
 */

export interface TrendRow {
  month: string;
  metric_key: string;
  value: number | null;
}

/**
 * Rows onto a fixed month axis, one array per key, oldest first.
 *
 * Every returned array is exactly `months.length` long, so a caller can
 * index a point and a month label together without checking. A month with
 * no row is null — never 0, which would be a figure somebody entered.
 */
export function alignToMonths(
  rows: TrendRow[],
  metricKeys: string[],
  months: string[],
): Map<string, (number | null)[]> {
  const index = new Map(months.map((month, i) => [month, i]));
  const aligned = new Map<string, (number | null)[]>(
    metricKeys.map((key) => [key, months.map(() => null)]),
  );

  for (const row of rows) {
    const series = aligned.get(row.metric_key);
    const at = index.get(row.month);
    // A row outside the window, or for a key nobody asked for, is dropped
    // rather than appended: the axis is the calendar, not the data.
    if (!series || at === undefined) continue;
    series[at] = row.value;
  }

  return aligned;
}

/** Whether a run of points has enough in it to be worth drawing. */
export function hasShape(points: (number | null)[] | undefined): boolean {
  return (points ?? []).filter((p) => p !== null).length >= 2;
}
