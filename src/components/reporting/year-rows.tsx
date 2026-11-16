import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/reporting/icons";
import { changeTone, formatChange } from "@/lib/reporting/format";
import { monthOnMonthChange } from "@/lib/reporting/formulas";
import { formatCell, summaryLabel, type YearRow } from "@/lib/reporting/year-table";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Your year, month by month".
 *
 * Nina, 17 November: the gridded table "still looks like an old-fashioned
 * spreadsheet, and the green/red change figures aren't clear enough". So:
 * no rules, spacing instead of lines, the figure names in navy behind a
 * small bar in the section's own colour, and the change as a **tinted pill**
 * rather than a caption — 11px, medium, with the arrow inside it.
 *
 * **Option B, chosen 17 November**: every cell also wears a soft wash,
 * green through red by the size and direction of its change, so the shape
 * of a year is readable before a single figure is. Option A was the same
 * without the wash; she compared them on the demo and took this one.
 *
 * The figures stay `font-num` — Inter with tabular numerals — so the columns
 * still line up without a rule to line them up against.
 */

/** The ink a pill wears. Tints of the two colours the KPI cards use. */
const PILL: Record<"good" | "bad" | "neutral", string> = {
  good: "bg-[rgb(31_122_77/0.14)] text-[#176139]",
  bad: "bg-[rgb(158_59_47/0.14)] text-[#8a3328]",
  neutral: "bg-ink/7 text-ink/55",
};

/** The section's colour, as the bar beside a figure's name. */
const BAR: Record<"sky" | "gold", string> = {
  sky: "bg-sky",
  gold: "bg-gold",
};

/**
 * The cell wash: the same two hues as the pills, at an alpha that
 * grows with the size of the change and stops well short of competing with
 * the figure on top of it.
 *
 * A move of 25% or more is as dark as it gets. Beyond that the tint would
 * carry no more information and the number would start to fight it.
 */
function heatTint(
  change: number | null,
  tone: "good" | "bad" | "neutral" | null,
  /** Print needs more: a 4% tint on paper is white. */
  ceiling = 0.16,
): string | undefined {
  if (change === null || tone === null || tone === "neutral") return undefined;
  const strength = Math.min(Math.abs(change) / 25, 1) * ceiling;
  if (strength < 0.02) return undefined;
  const rgb = tone === "good" ? "31 122 77" : "158 59 47";
  return `rgb(${rgb} / ${strength.toFixed(3)})`;
}

function Pill({ change, row }: { change: number | null; row: YearRow }) {
  const text = formatChange(change);
  const tone = changeTone(change, row.goodDirection);
  if (!text || !tone) return null;

  return (
    <span
      className={`mt-1 inline-flex items-center whitespace-nowrap rounded-full px-1 py-0.5 font-num text-[0.6875rem] font-medium leading-none ${PILL[tone]}`}
    >
      {text}
    </span>
  );
}

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

  const last = rows.length - 1;

  return (
    <Card className="mt-6">
      <SectionTitle icon={<IconCircle name="financials" tone={tone} />} aside={String(year)}>
        {title}
      </SectionTitle>

      <div className="relative -mx-5 mt-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        {/* **The colgroup, the `min-w` and the card's own width all have
            to agree.** 9.5 + 12 × 4.125 + 6.25 = 65.25rem = 1044px, and
            the card gives the scroller 1054px at desktop.

            Measured, not guessed, because the first attempt was guessed:
            10.5 + 12 × 4.5 + 6.5 came to 1136px inside that 1054px, so
            the table overflowed by 82px and the pinned Year column
            printed itself over exactly 82px of November. The same failure
            the gridded version had, reintroduced by widening the months
            for the pill without checking what they had to fit inside. The
            spec asserts November's right edge against the Year column's
            left edge so it cannot come back. */}
        <table className="w-full min-w-[65.25rem] table-fixed border-separate border-spacing-0 text-small">
          <colgroup>
            <col className="w-[9.5rem]" />
            {SHORT.map((m) => (
              <col key={m} className="w-[4.125rem]" />
            ))}
            <col className="w-[6.25rem]" />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-sans text-caption font-medium uppercase tracking-wide text-ink/45"
              >
                Figure
              </th>
              {SHORT.map((label, i) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-1.5 pb-2 pt-1 text-right font-display text-body font-medium ${
                    i === currentMonthIndex
                      ? "rounded-t-xl bg-gold/25 text-ink"
                      : "text-ink/55"
                  }`}
                >
                  {label}
                  {i === currentMonthIndex ? (
                    <span className="sr-only"> (the month this report is for)</span>
                  ) : null}
                </th>
              ))}
              {/* **The summary end column, tinted as one piece and
                  pinned** — it is the figure most people are looking for,
                  and unpinned it sat off the right edge until you
                  scrolled to it.

                  The shadow is not decoration. On a phone the grid is
                  wider than the screen, so this column sits on top of
                  whatever month is underneath it; without an edge it
                  reads as a block dropped into the middle of February
                  rather than as something laid over the top. Caught on
                  the phone screenshot. */}
              <th
                scope="col"
                className="sticky right-0 z-10 rounded-t-xl bg-cream-deep px-2.5 pb-2 pt-1 text-right font-display text-body font-medium text-ink shadow-[-10px_0_14px_-8px_rgb(10_30_74/0.18)]"
              >
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.key}>
                {/* **Navy, behind the section's own colour as a bar.**
                    No tinted column and no alternating stripe: the
                    separator is a hairline at 6% and the rest is space. */}
                <th
                  scope="row"
                  className={`sticky left-0 z-10 bg-card py-3.5 pr-3 text-left align-middle font-sans text-small font-medium text-navy shadow-[10px_0_14px_-8px_rgb(10_30_74/0.12)] ${
                    r === last ? "" : "border-b border-ink/6"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`h-3.5 w-[3px] shrink-0 rounded-full ${BAR[tone]}`}
                    />
                    <span className="min-w-0">{row.label}</span>
                  </span>
                </th>

                {row.values.map((value, i) => {
                  const previous = i === 0 ? null : row.values[i - 1];
                  const change = i === 0 ? null : monthOnMonthChange(value, previous);
                  const isCurrent = i === currentMonthIndex;
                  // Not under the gold column: two backgrounds fighting
                  // would make the month this report is about the hardest
                  // one on the page to read.
                  const wash = isCurrent
                    ? undefined
                    : heatTint(change, changeTone(change, row.goodDirection));

                  return (
                    <td
                      key={i}
                      style={wash ? { backgroundColor: wash } : undefined}
                      className={`px-1.5 py-3.5 text-right align-middle ${
                        r === last ? "" : "border-b border-ink/6"
                      } ${
                        isCurrent
                          ? `bg-gold/25 ${r === last ? "rounded-b-xl" : ""}`
                          : ""
                      }`}
                    >
                      <span
                        className={`block font-num text-small ${
                          value === null
                            ? "text-ink/25"
                            : isCurrent
                              ? "font-medium text-ink"
                              : "text-ink/85"
                        }`}
                      >
                        {formatCell(value, row.unit, currency)}
                      </span>
                      <Pill change={change} row={row} />
                    </td>
                  );
                })}

                <td
                  className={`sticky right-0 z-10 whitespace-nowrap bg-cream-deep px-2.5 py-3.5 text-right align-middle shadow-[-10px_0_14px_-8px_rgb(10_30_74/0.18)] ${
                    r === last ? "rounded-b-xl" : ""
                  }`}
                >
                  <span className="block font-num text-small font-semibold text-ink">
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

      <p className="mt-4 text-caption text-ink/55">
        January to December {year}. A blank month is one nobody has filled in yet, not a zero. The
        pill under each month is the change on the month before it, green where that is the
        direction you want, and the cell is tinted the same way. Rates are
        averaged over the months that have a figure; everything else is a total, except a running
        level like followers or list size, which shows its latest reading.
      </p>
    </Card>
  );
}

/**
 * The same year, for paper.
 *
 * **No card, no scroller, smaller type**: a printed page cannot scroll, so
 * thirteen columns have to fit the width instead, and the surface
 * underneath is white like the rest of the document.
 *
 * It carries the pills and the wash, because Nina's choice was about how a
 * year reads and the PDF is the version a client keeps. Two concessions to
 * print: the wash is a little stronger, since inkjet and screen render a 4%
 * tint very differently, and the pill loses its background on a cell that
 * already has one — a tint inside a tint prints as a smudge.
 *
 * The caption goes. It explains a control the reader of a PDF does not have.
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
      <table className="mt-2 w-full border-separate border-spacing-0 text-caption">
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-2 text-left font-sans text-[0.625rem] font-medium uppercase tracking-wide text-ink/45">
              Figure
            </th>
            {SHORT.map((label) => (
              <th key={label} scope="col" className="px-1 py-1 text-right font-display font-medium text-ink/70">
                {label}
              </th>
            ))}
            <th scope="col" className="rounded-t bg-cream-deep px-1.5 py-1 text-right font-display font-medium text-ink">
              Year
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const last = r === rows.length - 1;
            return (
              <tr key={row.key}>
                <th
                  scope="row"
                  className={`py-2 pr-2 text-left align-middle font-sans font-medium text-navy ${
                    last ? "" : "border-b border-ink/8"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="h-2.5 w-[2px] shrink-0 rounded-full bg-gold" />
                    {row.label}
                  </span>
                </th>
                {row.values.map((value, i) => {
                  const previous = i === 0 ? null : row.values[i - 1];
                  const change = i === 0 ? null : monthOnMonthChange(value, previous);
                  const tone = changeTone(change, row.goodDirection);
                  const wash = heatTint(change, tone, 0.24);
                  const text = formatChange(change);
                  return (
                    <td
                      key={i}
                      style={wash ? { backgroundColor: wash } : undefined}
                      className={`px-1 py-2 text-right align-middle ${
                        last ? "" : "border-b border-ink/8"
                      }`}
                    >
                      <span className="block font-num tabular-nums text-ink/85">
                        {formatCell(value, row.unit, currency)}
                      </span>
                      {text && tone ? (
                        <span
                          className={`block font-num text-[0.5625rem] font-medium leading-none ${
                            tone === "good"
                              ? "text-[#176139]"
                              : tone === "bad"
                                ? "text-[#8a3328]"
                                : "text-ink/50"
                          }`}
                        >
                          {text}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
                <td
                  className={`whitespace-nowrap bg-cream-deep px-1.5 py-2 text-right align-middle ${
                    last ? "rounded-b" : ""
                  }`}
                >
                  <span className="block font-num tabular-nums font-semibold text-ink">
                    {formatCell(row.summary.value, row.unit, currency)}
                  </span>
                  <span className="block font-sans text-[0.5rem] uppercase leading-none tracking-wide text-ink/45">
                    {summaryLabel(row)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
