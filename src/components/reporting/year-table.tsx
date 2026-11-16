import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/reporting/icons";
import { CHANGE_TONE_CLASS, changeTone, formatChange } from "@/lib/reporting/format";
import { monthOnMonthChange } from "@/lib/reporting/formulas";
import { formatCell, summaryLabel, type YearRow } from "@/lib/reporting/year-table";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * One cell: the figure, and under it what it did since last month.
 *
 * **Quiet on purpose** (Nina, 16 November: "keep it small and quiet so
 * the figures stay the main thing"). The change is a caption under the
 * number, not beside it — beside it, twelve columns of ±% read as a
 * second table competing with the first.
 *
 * Green and red come from the figure's own good direction, through the
 * same two helpers the KPI cards use, so costs falling is green here
 * and green there. January has nothing under it: there is no month
 * before it in this table, and "—" would imply we looked.
 */
function YearCell({
  row,
  index,
  isCurrent,
  currency,
}: {
  row: YearRow;
  index: number;
  isCurrent: boolean;
  currency: string;
}) {
  const value = row.values[index];
  const previous = index === 0 ? null : row.values[index - 1];
  const change = index === 0 ? null : monthOnMonthChange(value, previous);
  const text = formatChange(change);
  const tone = changeTone(change, row.goodDirection);

  return (
    <td
      className={`px-1.5 py-2.5 text-right align-top ${
        isCurrent ? "bg-gold/15" : ""
      }`}
    >
      <span
        className={`block font-num text-small ${
          value === null ? "text-ink/30" : isCurrent ? "font-medium text-ink" : "text-ink/80"
        }`}
      >
        {formatCell(value, row.unit, currency)}
      </span>
      {text && tone ? (
        <span className={`mt-0.5 block font-num text-[0.625rem] leading-none ${CHANGE_TONE_CLASS[tone]}`}>
          {text}
        </span>
      ) : null}
    </td>
  );
}

/**
 * The year as a grid, at the foot of every report page.
 *
 * **It scrolls inside its card and the page does not move sideways.**
 * Thirteen columns will not fit a phone and are not meant to; the same
 * arrangement the money grids use, with the `relative` that stops the
 * screen-reader labels escaping the scroller and dragging the page
 * (found on a phone screenshot, 13 November).
 *
 * Styled rather than plain (Nina, 16 November): a tinted header, the
 * month names in the display face, the figure names as a tinted first
 * column that reads as a menu down the side, alternating rows, and the
 * month this report is about picked out in gold through the whole
 * column — header, cells and all.
 */
export function YearTable({
  rows,
  year,
  currency,
  currentMonthIndex,
  title = "Your year, month by month",
  tone = "sky",
}: {
  rows: YearRow[];
  year: number;
  currency: string;
  /** 0–11, or -1 when the month being read is not in this year. */
  currentMonthIndex: number;
  title?: string;
  tone?: "sky" | "gold";
}) {
  if (rows.length === 0) return null;

  return (
    <Card className="mt-6">
      <SectionTitle icon={<IconCircle name="financials" tone={tone} />} aside={String(year)}>
        {title}
      </SectionTitle>

      <div className="relative -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        {/* **Fixed columns, every month the same width** (Nina, 16
            November). Left to itself the browser gave December less
            room than the rest — the last column before a pinned one —
            and "£33,914" spilled into the Year column. `table-fixed`
            with a colgroup is the only arrangement where twelve months
            are actually twelve equal columns rather than twelve columns
            the content happened to size. */}
        <table className="w-full min-w-[65rem] table-fixed border-collapse text-small">
          <colgroup>
            <col className="w-[9.5rem]" />
            {SHORT.map((m) => (
              <col key={m} className="w-[4.125rem]" />
            ))}
            <col className="w-[6rem]" />
          </colgroup>
          <thead>
            <tr className="bg-cream-deep">
              <th
                scope="col"
                className="sticky left-0 z-10 rounded-l-xl bg-cream-deep py-2.5 pl-3 pr-3 text-left font-sans text-caption font-medium uppercase tracking-wide text-ink/60"
              >
                Figure
              </th>
              {SHORT.map((label, i) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-1.5 py-2.5 text-right font-display text-body font-medium ${
                    i === currentMonthIndex ? "bg-gold/30 text-ink" : "text-ink/70"
                  }`}
                >
                  {label}
                  {i === currentMonthIndex ? (
                    <span className="sr-only"> (the month this report is for)</span>
                  ) : null}
                </th>
              ))}
              {/* **Pinned, like the first column.** The table is wider
                  than the card by design — twelve months plus a change
                  under each — so without this the Year column, which is
                  the one most people are looking for, sat off the right
                  edge until you scrolled to it. */}
              <th
                scope="col"
                className="sticky right-0 z-10 rounded-r-xl bg-cream-deep px-1.5 py-2.5 text-right font-display text-body font-medium text-ink shadow-[-8px_0_12px_-8px_rgb(10_30_74/0.15)]"
              >
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.key} className={r % 2 === 1 ? "bg-cream-deep/40" : ""}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 py-2.5 pl-3 pr-3 text-left align-top font-sans text-small font-medium text-ink ${
                    r % 2 === 1 ? "bg-[#F4EEE4]" : "bg-card"
                  }`}
                >
                  {row.label}
                </th>
                {row.values.map((_, i) => (
                  <YearCell
                    key={i}
                    row={row}
                    index={i}
                    isCurrent={i === currentMonthIndex}
                    currency={currency}
                  />
                ))}
                <td
                  className={`sticky right-0 z-10 whitespace-nowrap px-1.5 py-2.5 text-right align-top shadow-[-8px_0_12px_-8px_rgb(10_30_74/0.15)] ${
                    r % 2 === 1 ? "bg-[#F4EEE4]" : "bg-card"
                  }`}
                >
                  <span className="block font-num text-small font-medium text-ink">
                    {formatCell(row.summary.value, row.unit, currency)}
                  </span>
                  <span className="mt-0.5 block font-sans text-[0.625rem] uppercase leading-none tracking-wide text-ink/45">
                    {summaryLabel(row)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-caption text-ink/55">
        January to December {year}. A blank month is one nobody has filled in yet, not a zero. The
        small figure under each month is the change on the month before it, green where that is the
        direction you want. Rates are averaged over the months that have a figure; everything else
        is a total, except a running level like followers or list size, which shows its latest
        reading.
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
        Your year, month by month <span className="font-num text-caption text-ink/55">{year}</span>
      </h3>
      <table className="mt-2 w-full border-collapse text-caption">
        <thead>
          <tr className="border-b border-ink/20">
            <th scope="col" className="py-1 pr-2 text-left font-medium text-ink/70">Figure</th>
            {SHORT.map((label) => (
              <th key={label} scope="col" className="px-1 py-1 text-right font-num font-medium text-ink/60">
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
                <td key={i} className="px-1 py-1 text-right font-num tabular-nums text-ink/80">
                  {formatCell(value, row.unit, currency)}
                </td>
              ))}
              <td className="px-1 py-1 text-right font-num tabular-nums text-ink">
                {formatCell(row.summary.value, row.unit, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
