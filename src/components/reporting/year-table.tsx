import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/reporting/icons";
import { formatCell, summaryLabel, type YearRow } from "@/lib/reporting/year-table";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The year as a grid, at the foot of every report page.
 *
 * **It scrolls inside its card and the page does not move sideways.**
 * Thirteen columns will not fit a phone and are not meant to; the same
 * arrangement the money grids use, with the `relative` that stops the
 * screen-reader labels escaping the scroller and dragging the page
 * (found on a phone screenshot, 13 November).
 *
 * The month being read is marked, because a client scanning twelve
 * columns needs to know which one the rest of the page is about.
 */
export function YearTable({
  rows,
  year,
  currency,
  currentMonthIndex,
}: {
  rows: YearRow[];
  year: number;
  currency: string;
  /** 0–11, or -1 when the month being read is not in this year. */
  currentMonthIndex: number;
}) {
  if (rows.length === 0) return null;

  return (
    <Card className="mt-6">
      <SectionTitle icon={<IconCircle name="financials" tone="sky" />} aside={String(year)}>
        Your year, month by month
      </SectionTitle>

      <div className="relative -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[46rem] border-collapse text-small">
          <thead>
            <tr className="border-b border-ink/12">
              <th scope="col" className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-medium text-ink/70">
                Figure
              </th>
              {SHORT.map((label, i) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-1.5 py-2 text-right font-mono text-caption font-medium ${
                    i === currentMonthIndex ? "text-ink" : "text-ink/55"
                  }`}
                >
                  {label}
                  {i === currentMonthIndex ? <span className="sr-only"> (the month this report is for)</span> : null}
                </th>
              ))}
              <th scope="col" className="px-1.5 py-2 text-right font-medium text-ink/70">
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-ink/8 last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-normal text-ink">
                  {row.label}
                </th>
                {row.values.map((value, i) => (
                  <td
                    key={i}
                    className={`px-1.5 py-2 text-right font-mono tabular-nums ${
                      value === null ? "text-ink/30" : i === currentMonthIndex ? "text-ink" : "text-ink/75"
                    }`}
                  >
                    {formatCell(value, row.unit, currency)}
                  </td>
                ))}
                <td className="whitespace-nowrap px-1.5 py-2 text-right font-mono tabular-nums text-ink">
                  {formatCell(row.summary.value, row.unit, currency)}
                  <span className="ml-1 font-sans text-caption text-ink/50">
                    {summaryLabel(row).toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-caption text-ink/55">
        January to December {year}. A blank month is one nobody has filled in yet, not a zero.
        Rates are averaged over the months that have a figure; everything else is a total, except a
        running level like followers or list size, which shows its latest reading.
      </p>
    </Card>
  );
}

/**
 * The same grid, for paper.
 *
 * **No card, no scroller, smaller type.** A printed page cannot scroll,
 * so thirteen columns have to fit the width instead — and the surface
 * underneath is white rather than cream, like everything else in the
 * document. The caption goes too: it explains a control the reader of a
 * PDF does not have.
 */
export function PrintYearTable({
  rows,
  year,
  currency,
}: {
  rows: YearRow[];
  year: number;
  currency: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="keep-together mt-5">
      <h3 className="font-display text-heading font-medium text-ink">
        Your year, month by month <span className="font-mono text-caption text-ink/55">{year}</span>
      </h3>
      <table className="mt-2 w-full border-collapse text-caption">
        <thead>
          <tr className="border-b border-ink/20">
            <th scope="col" className="py-1 pr-2 text-left font-medium text-ink/70">Figure</th>
            {SHORT.map((label) => (
              <th key={label} scope="col" className="px-1 py-1 text-right font-mono font-medium text-ink/60">
                {label}
              </th>
            ))}
            <th scope="col" className="px-1 py-1 text-right font-medium text-ink/70">Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-ink/10 last:border-0">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-ink">{row.label}</th>
              {row.values.map((value, i) => (
                <td key={i} className="px-1 py-1 text-right font-mono tabular-nums text-ink/80">
                  {formatCell(value, row.unit, currency)}
                </td>
              ))}
              <td className="px-1 py-1 text-right font-mono tabular-nums text-ink">
                {formatCell(row.summary.value, row.unit, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
