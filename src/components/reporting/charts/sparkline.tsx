import { sparkFill, sparkStroke } from "./palette.ts";
import type { IconTone } from "../icons";

/**
 * The shape of a metric's last twelve months, on the KPI card.
 *
 * **It is a shape, not a reading.** There is no axis, no scale and no
 * labels, so nothing here can be read as a number — the card already prints
 * the figure, the month-on-month change and the month it is compared
 * against. What this adds is the one thing those three cannot say: whether
 * the month sits on a climb, a fall or a flat run.
 *
 * **The baseline is the lowest point, not zero**, which is the usual
 * objection to sparklines and is the right choice here for the same reason
 * it is usually wrong elsewhere: a follower count that moves from 24,000 to
 * 26,420 is a flat line against a zero baseline, and the shape is the only
 * thing this draws. Because of that the `aria-label` says the span in words
 * and in figures, so a reader who cannot see the shape gets what it was for
 * rather than "chart".
 *
 * A gap is a gap. A month with nothing entered breaks the line rather than
 * being interpolated across — joining two points over a missing month would
 * draw a measurement nobody made.
 */

/**
 * Sized to the narrowest card it has to sit in, not to the space on a
 * roomy one: six across at 1440 leaves a card about 138px wide inside its
 * padding, and at 72px the shape pushed "↑ 611%" onto three lines on the
 * New leads card. Measured on the rendered row, not guessed.
 */
const W = 54;
const H = 24;
/** Room for the 2px stroke and the dot's radius, so neither is clipped. */
const PAD = 3;

export function Sparkline({
  points,
  label,
  tone,
}: {
  /** One per month, oldest first. Null is a month with nothing entered. */
  points: (number | null)[];
  /** What the shape is of — "Revenue over the last 12 months". */
  label: string;
  /**
   * The tone of the icon disc on the same card, so the line is drawn in
   * that colour's ink. Omitted on a card with no disc, which gets navy.
   */
  tone?: IconTone;
}) {
  const present = points
    .map((value, i) => ({ value, i }))
    .filter((p): p is { value: number; i: number } => p.value !== null);

  // Two points is the least that has a shape. One is a dot that says
  // nothing, and none is an empty box pretending to be a chart.
  if (present.length < 2) return null;

  const values = present.map((p) => p.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;

  const x = (i: number) =>
    PAD + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - PAD * 2));
  // A flat run has no span to divide by, and sits in the middle rather than
  // on the floor — a straight line along the bottom reads as "zero".
  const y = (v: number) =>
    span === 0 ? H / 2 : PAD + (1 - (v - low) / span) * (H - PAD * 2);

  // Runs of consecutive months, so a gap breaks the line instead of being
  // drawn through.
  const runs: { value: number; i: number }[][] = [];
  for (const point of present) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1].i === point.i - 1) last.push(point);
    else runs.push([point]);
  }

  const last = present[present.length - 1];
  const first = present[0];

  const stroke = sparkStroke(tone);
  const fill = sparkFill(tone);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`${label}: from ${first.value.toLocaleString("en-GB")} to ${last.value.toLocaleString("en-GB")}`}
    >
      {runs.map((run) =>
        run.length < 2 ? null : (
          <polygon
            key={`fill-${run[0].i}`}
            points={[
              `${x(run[0].i)},${H}`,
              ...run.map((p) => `${x(p.i)},${y(p.value)}`),
              `${x(run[run.length - 1].i)},${H}`,
            ].join(" ")}
            fill={fill}
          />
        ),
      )}
      {runs.map((run) =>
        run.length < 2 ? (
          // A single month stranded between two gaps still gets a dot, or
          // the month would simply vanish from the picture.
          <circle
            key={`dot-${run[0].i}`}
            cx={x(run[0].i)}
            cy={y(run[0].value)}
            r="1.75"
            fill={stroke}
          />
        ) : (
          <polyline
            key={`line-${run[0].i}`}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={run.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")}
          />
        ),
      )}
      {/* The month the card is about, marked — otherwise the eye has no
          anchor for which end is now. */}
      <circle
        cx={x(last.i)}
        cy={y(last.value)}
        r="2.75"
        fill={stroke}
        stroke="var(--aos-card)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
