import { compactAxisValue, type Unit } from "@/lib/reporting/format";
import { EDGE, MAX_LINES, strokeFor } from "./palette.ts";
import { niceCeiling } from "./scale.ts";

/**
 * One or two measures across a run of months — revenue against profit,
 * followers over the year, save rate against share rate.
 *
 * **Not `LineChart`.** That one plots a sequence of emails, where the x axis
 * is a position (1, 2, 3) and every series shares one percentage scale. This
 * one plots a calendar, where the axis is months that exist whether or not
 * anything was entered in them, and the scale is whatever unit the metric
 * is in. Two charts rather than one with a mode, because the two have
 * almost nothing in common but the word "line".
 *
 * **One axis, always.** Two measures share this chart only when they share a
 * unit — revenue and profit are both money, reach and views are both
 * counts. A second y scale would let any two lines be drawn crossing, which
 * is a picture of the scales rather than of the business.
 *
 * **A month with nothing entered is a gap, not a zero.** The axis is built
 * from the calendar by `monthsEndingAt`, so a quiet August leaves a break in
 * the line instead of being closed up — closing it up would draw a July that
 * ran straight into September.
 *
 * Plain SVG, server-rendered, no library: it is in the HTML the client is
 * sent, which is also what makes it testable.
 */

export interface TrendSeries {
  label: string;
  /** One per month, oldest first. Null is a month with nothing entered. */
  points: (number | null)[];
}

/**
 * The viewBox, which is also what decides how big the axis labels end up.
 *
 * An SVG with a 640-wide viewBox drawn into a 330px card is scaled to
 * 0.52, and 0.6rem text comes out at about 5px — unreadable, and nothing
 * in the markup says so. So the box is sized to the column the chart sits
 * in: a chart sharing a row with two others gets a narrower one, which
 * scales UP rather than down. Seen on the three-across Social Media row,
 * not reasoned about.
 */
const WIDE = 640;
const NARROW = 380;
const H = 240;
const PAD = { top: 14, right: 14, bottom: 26, left: 48 };

export function TrendChart({
  series,
  months,
  unit,
  currency,
  target,
  targetLabel,
  area = false,
  caption,
  emptyMessage,
  narrow = false,
}: {
  series: TrendSeries[];
  /** The x axis: short month labels, oldest first, same length as `points`. */
  months: string[];
  unit: Unit;
  currency?: string;
  /** A reference line across the chart — the metric's target (§7). */
  target?: number | null;
  targetLabel?: string;
  /**
   * Fill under the line. Only ever for a SINGLE series: two overlapping
   * washes make a third colour that means nothing, and the area under a
   * line is a quantity, which only reads if there is one of them.
   */
  area?: boolean;
  caption?: string;
  emptyMessage: string;
  /** True where the chart shares its row, so the labels stay legible. */
  narrow?: boolean;
}) {
  const W = narrow ? NARROW : WIDE;
  /**
   * The axis labels, sized against how much the viewBox is scaled by.
   *
   * A narrow chart is about 330px wide whether it is one of three on a
   * desktop row or the only one on a phone, so 380 units scale by ~0.87
   * and one size serves both. A wide chart does not have that luck: 640
   * units into a phone's 340px is a scale of 0.53 and into a desktop
   * card's 1000px is 1.56, which is three times the difference. So its
   * size changes where the container does.
   */
  const axisText = narrow ? "text-[0.7rem]" : "text-[1.1rem] sm:text-[0.5rem]";
  const drawn = series.filter((s) => s.points.some((p) => p !== null));
  const values = drawn.flatMap((s) => s.points.filter((p): p is number => p !== null));

  // §4 in chart form: nothing drawn from nothing. An empty grid with axes
  // reads as "zero", which is a claim about the year rather than a picture
  // of it.
  if (values.length < 2) return <p className="text-small text-ink/55">{emptyMessage}</p>;

  const high = Math.max(...values, target ?? Number.NEGATIVE_INFINITY);
  const low = Math.min(...values, 0);
  // Round the top to something a person would pick, so the gridlines read
  // £10K/£20K/£30K rather than £11,480/£22,960.
  const scaleTop = niceCeiling(high);
  const scaleBottom = low < 0 ? -niceCeiling(Math.abs(low)) : 0;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (months.length === 1 ? plotW / 2 : (i / (months.length - 1)) * plotW);
  const y = (v: number) =>
    PAD.top + plotH - ((v - scaleBottom) / (scaleTop - scaleBottom)) * plotH;

  const gridlines = [0, 0.25, 0.5, 0.75, 1].map(
    (f) => scaleBottom + (scaleTop - scaleBottom) * f,
  );

  // Twelve labels will not fit under a chart at card width, so every other
  // one is drawn — always including the last, which is the month the page
  // is about.
  const labelEvery = months.length > 8 ? 2 : 1;

  const area1 = area && drawn.length === 1;
  /**
   * The target line's ink: the next one past the series'.
   *
   * Fixed rather than `strokeFor(1)`, which on a two-line chart is the
   * second series' own colour — a dashed navy target over a navy profit
   * line, both saying different things in the same ink. Nothing in Stage
   * 3 draws that combination; the next chart with a target on two series
   * would have.
   */
  const targetStroke = strokeFor(series.length);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${drawn.map((s) => s.label).join(" and ")} across ${months.length} months`}
      >
        {gridlines.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke={EDGE}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              className={`fill-ink/45 font-mono ${axisText}`}
            >
              {compactAxisValue(value, unit, currency)}
            </text>
          </g>
        ))}

        {target === null || target === undefined ? null : (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(target)}
            y2={y(target)}
            stroke={targetStroke}
            strokeWidth="2"
            strokeDasharray="6 5"
          />
        )}

        {drawn.map((line, index) => {
          // The colour follows the series' place in the WHOLE list, so a
          // metric with nothing entered still holds its ink and filling it
          // in later does not repaint the other one.
          const colour = strokeFor(series.indexOf(line));
          const present = line.points
            .map((value, i) => ({ value, i }))
            .filter((p): p is { value: number; i: number } => p.value !== null);

          // Runs of consecutive months. A gap breaks the line rather than
          // being drawn through.
          const runs: { value: number; i: number }[][] = [];
          for (const point of present) {
            const tail = runs[runs.length - 1];
            if (tail && tail[tail.length - 1].i === point.i - 1) tail.push(point);
            else runs.push([point]);
          }

          return (
            <g key={line.label}>
              {area1
                ? runs.map((run) =>
                    run.length < 2 ? null : (
                      <polygon
                        key={`area-${run[0].i}`}
                        points={[
                          `${x(run[0].i)},${y(scaleBottom)}`,
                          ...run.map((p) => `${x(p.i)},${y(p.value)}`),
                          `${x(run[run.length - 1].i)},${y(scaleBottom)}`,
                        ].join(" ")}
                        fill={colour}
                        opacity="0.12"
                      />
                    ),
                  )
                : null}

              {runs.map((run) =>
                run.length < 2 ? null : (
                  <polyline
                    key={`line-${run[0].i}`}
                    fill="none"
                    stroke={colour}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={run.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")}
                  />
                ),
              )}

              {present.map((p) => (
                <circle
                  key={`${index}-${p.i}`}
                  cx={x(p.i)}
                  cy={y(p.value)}
                  r="4"
                  fill={colour}
                  // A 2px ring in the surface colour, so two points that
                  // land on each other stay two points.
                  stroke="var(--aos-card)"
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        {months.map((label, i) =>
          i % labelEvery === 0 || i === months.length - 1 ? (
            <text
              key={`${label}-${i}`}
              x={x(i)}
              y={H - 7}
              textAnchor="middle"
              className={`fill-ink/45 font-mono ${axisText}`}
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      {/* A legend whenever there is more than one line, and for the target
          line whether or not there is — identity is never carried by colour
          alone, and a dashed line nobody has named is furniture. */}
      {drawn.length > 1 || (target !== null && target !== undefined) ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {drawn.map((line) => (
            <li key={line.label} className="flex items-center gap-2 text-small text-ink/70">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-5 rounded-full"
                style={{ background: strokeFor(series.indexOf(line)) }}
              />
              {line.label}
            </li>
          ))}
          {target === null || target === undefined ? null : (
            <li className="flex items-center gap-2 text-small text-ink/70">
              <span
                aria-hidden="true"
                className="inline-block h-0 w-5 border-t-2 border-dashed"
                style={{ borderColor: targetStroke }}
              />
              {targetLabel ?? "Target"}
            </li>
          )}
        </ul>
      ) : null}

      {caption ? (
        <figcaption className="mt-2 text-caption text-ink/55">{caption}</figcaption>
      ) : null}

      {series.length > MAX_LINES ? (
        <p className="mt-1 text-caption text-ink/45">
          Past three lines the inks stop separating reliably, so the rest share one.
        </p>
      ) : null}
    </figure>
  );
}

