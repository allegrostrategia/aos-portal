import { compactAxisValue, type Unit } from "@/lib/reporting/format";
import { EDGE, SEPARATOR, fillFor } from "./palette.ts";
import { niceCeiling } from "./scale.ts";

/**
 * Two measures compared month by month — reach against views.
 *
 * **Bars rather than lines, and grouped rather than stacked.** The mockup
 * draws it this way and it is the right form twice over: these are discrete
 * months being compared with each other, not a level moving continuously,
 * and views are not a part of reach, so stacking them would add two numbers
 * that do not sum to anything.
 *
 * **Fills, so the five-hue palette applies rather than the line inks.** A
 * bar is a large shape with a hairline round it, which is what lets orange
 * and sky survive at 2.93:1 and 1.60:1 on a white card. The same two hues
 * as a 2px line would be very nearly invisible, which is why `LINE_SERIES`
 * exists separately.
 *
 * **One axis.** Both series are counts on the same scale. Two scales would
 * let the shorter bar be drawn taller, which is a picture of the scales.
 *
 * A month with nothing entered leaves a space rather than a zero bar: a zero
 * bar is a measurement, and nobody made it.
 */

export interface GroupedSeries {
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
/** The gap between one month's pair and the next month's. */
const GROUP_GAP = 0.32;
/** The surface-coloured sliver between the two bars of a pair. */
const BAR_GAP = 2;

export function GroupedBarChart({
  series,
  months,
  unit,
  currency,
  caption,
  emptyMessage,
  narrow = false,
  colours = "pair",
}: {
  series: GroupedSeries[];
  months: string[];
  unit: Unit;
  currency?: string;
  caption?: string;
  emptyMessage: string;
  /** True where the chart shares its row, so the labels stay legible. */
  narrow?: boolean;
  /**
   * Which two hues, or which n.
   *
   * `"pair"` is two measures of the same thing side by side — reach
   * against views — and takes orange and sky, skipping gold so the two
   * are as far apart as the palette allows.
   *
   * `"entities"` is one bar per identity: an offer, a campaign. It walks
   * `SERIES` in order from the first, so the nth offer by the page's own
   * ordering keeps the nth colour and matches the donut beside it. That
   * is the palette's rule — colour follows the entity, never its rank in
   * this particular chart — and it only holds because the caller builds
   * both from the same list in the same order.
   */
  colours?: "pair" | "entities";
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

  if (values.length === 0) return <p className="text-small text-ink/55">{emptyMessage}</p>;

  const scaleTop = niceCeiling(Math.max(...values));

  // Against `series`, not `drawn`: an offer with an empty month must not
  // hand its colour to the next one along.
  const fillOf = (line: GroupedSeries) => {
    const index = series.indexOf(line);
    return fillFor(colours === "pair" ? (index === 0 ? 0 : 2) : index);
  };

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / months.length;
  const groupW = slot * (1 - GROUP_GAP);
  const barW = Math.max(3, groupW / drawn.length - BAR_GAP);

  const y = (v: number) => PAD.top + plotH - (v / scaleTop) * plotH;
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => scaleTop * f);

  const labelEvery = months.length > 8 ? 2 : 1;

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

        {months.map((label, monthIndex) => {
          const groupLeft = PAD.left + slot * monthIndex + (slot - groupW) / 2;

          return drawn.map((line, barIndex) => {
            const value = line.points[monthIndex];
            if (value === null || value === undefined) return null;

            const height = Math.max(1, (value / scaleTop) * plotH);

            return (
              <rect
                key={`${label}-${line.label}`}
                x={groupLeft + barIndex * (barW + BAR_GAP)}
                y={PAD.top + plotH - height}
                width={barW}
                height={height}
                rx="2"
                fill={fillOf(line)}
                // Every pale fill owes the reader a boundary where it meets
                // the card, and a separator so two bars never touch.
                stroke={EDGE}
                strokeWidth="1"
                style={{ paintOrder: "stroke" }}
              />
            );
          });
        })}

        {/* Drawn over the joins, in the card's own colour.
            **From the axis, not from zero.** Spanning the full width it
            also covered the bottom gridline's own label — "£0" sat at
            x < PAD.left and simply vanished under this, which looked like
            a chart whose scale started somewhere unstated. */}
        <rect
          x={PAD.left}
          y={PAD.top + plotH}
          width={W - PAD.left}
          height={PAD.bottom}
          fill={SEPARATOR}
        />

        {months.map((label, i) =>
          i % labelEvery === 0 || i === months.length - 1 ? (
            <text
              key={`${label}-${i}`}
              x={PAD.left + slot * i + slot / 2}
              y={H - 7}
              textAnchor="middle"
              className={`fill-ink/45 font-mono ${axisText}`}
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {drawn.map((line) => (
          <li key={line.label} className="flex items-center gap-2 text-small text-ink/70">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{
                background: fillOf(line),
                outline: `1px solid ${EDGE}`,
              }}
            />
            {line.label}
          </li>
        ))}
      </ul>

      {caption ? (
        <figcaption className="mt-2 text-caption text-ink/55">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

