import { EDGE, MAX_SERIES, SEPARATOR, fillFor } from "./palette.ts";

/**
 * Parts of a whole — share of revenue by offer, the four cost lines.
 *
 * A donut rather than a pie because the centre earns its keep: it holds the
 * total, which is what every slice is a share *of*. Nina asked for the
 * centre total to stay (5 Oct), and it is the one number here that is also
 * on a KPI card.
 *
 * **Identity is never colour alone.** Every slice is named in the legend
 * beside it with its amount and share, and the same numbers are available as
 * a table underneath, because three of the five series colours fall below
 * 3:1 against the cream card and a legend is the thing that makes that
 * survivable.
 *
 * A sixth slice folds into "Other" rather than inventing a hue: the palette
 * is five deep for a reason the checker will print.
 */

export interface Slice {
  label: string;
  value: number;
  /** Formatted by the caller — this never decides how money looks. */
  display: string;
  /**
   * Which colour this thing owns, fixed to the thing and not to its size.
   *
   * **Colour follows the entity, never its rank.** Without this the slices
   * were coloured by position after sorting, so an offer that overtook
   * another between two months swapped colours with it — and a client
   * comparing September to October would have seen their biggest offer
   * change colour for no reason. Caught 5 October by looking at the
   * rendered donut.
   */
  colorIndex: number;
}

const RADIUS = 60;
const THICKNESS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  slices,
  total,
  totalDisplay,
  totalLabel,
  emptyMessage,
}: {
  slices: Slice[];
  total: number | null;
  totalDisplay: string;
  totalLabel: string;
  emptyMessage: string;
}) {
  const positive = slices.filter((s) => s.value > 0);

  // §4: a dash, never a zero. A ring drawn from nothing is a lie about the
  // month rather than a chart of it.
  if (positive.length === 0 || !total || total <= 0) {
    return <p className="text-body text-ink/60">{emptyMessage}</p>;
  }

  const shown = positive.slice(0, MAX_SERIES);
  const rest = positive.slice(MAX_SERIES);
  const grouped = rest.length
    ? [
        ...shown,
        {
          label: `Other (${rest.length})`,
          value: rest.reduce((a, s) => a + s.value, 0),
          display: "",
          colorIndex: MAX_SERIES,
        },
      ]
    : shown;

  const sum = grouped.reduce((a, s) => a + s.value, 0);

  // Largest remainder, so the legend's percentages add up to 100. Rounding
  // each one on its own gave 29 + 24 + 48 = 101 on Test Client's September,
  // which is the kind of thing a client notices and nobody can explain.
  const exact = grouped.map((slice) => (slice.value / sum) * 100);
  const floors = exact.map(Math.floor);
  const shortfall = 100 - floors.reduce((a, n) => a + n, 0);
  const bumped = new Set(
    exact
      .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
      .sort((a, b) => b.remainder - a.remainder)
      .slice(0, Math.max(0, shortfall))
      .map((r) => r.index),
  );
  const percent = floors.map((n, i) => n + (bumped.has(i) ? 1 : 0));

  // Where each arc starts: the running total of everything before it. Built
  // without reassigning anything, which the React compiler insists on and
  // which reads better anyway.
  const starts = grouped.reduce<number[]>(
    (acc, slice) => [...acc, acc[acc.length - 1] + (slice.value / sum) * CIRCUMFERENCE],
    [0],
  );

  const arcs = grouped.map((slice, index) => {
    const fraction = slice.value / sum;
    return {
      ...slice,
      index,
      fraction,
      // A 2px gap in the surface colour, so two fills never touch. With
      // pale fills that gap is most of what separates them.
      dash: Math.max(0, fraction * CIRCUMFERENCE - 2),
      offset: starts[index],
      percent: percent[index],
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox="0 0 160 160"
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label={`${totalLabel}: ${totalDisplay}. ${arcs
          .map((a) => `${a.label} ${a.percent}%`)
          .join(", ")}.`}
      >
        <g transform="rotate(-90 80 80)">
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke={fillFor(arc.colorIndex)}
              strokeWidth={THICKNESS}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
          {/* The hairline goes on last and over everything, so a gold slice
              has a boundary where it meets the cream card. */}
          {arcs.map((arc) => (
            <circle
              key={`${arc.label}-edge`}
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke={EDGE}
              strokeWidth={THICKNESS}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
              style={{ mixBlendMode: "multiply" }}
              opacity={0.35}
            />
          ))}
        </g>

        {/* The ring's inner and outer edges, drawn in the surface colour so
            the donut reads as a ring rather than as a disc with a hole. */}
        <circle cx="80" cy="80" r={RADIUS - THICKNESS / 2} fill="none" stroke={SEPARATOR} strokeWidth="1" />
        <circle cx="80" cy="80" r={RADIUS + THICKNESS / 2} fill="none" stroke={SEPARATOR} strokeWidth="1" />

        <text
          x="80"
          y="76"
          textAnchor="middle"
          className="fill-ink font-mono"
          style={{ fontSize: "15px" }}
        >
          {totalDisplay}
        </text>
        <text
          x="80"
          y="94"
          textAnchor="middle"
          className="fill-ink/55"
          style={{ fontSize: "8px", letterSpacing: "0.08em" }}
        >
          {totalLabel.toUpperCase()}
        </text>
      </svg>

      {/* Capped, or on a wide card the amounts drift to the far edge and
          stop belonging to the names beside them. */}
      <ul className="flex w-full max-w-sm flex-col gap-2">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{
                background: fillFor(arc.colorIndex),
                boxShadow: `inset 0 0 0 1px ${EDGE}`,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-small text-ink">{arc.label}</span>
            <span className="font-mono text-small text-ink/70">
              {arc.display ? `${arc.display} · ` : ""}
              {arc.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
