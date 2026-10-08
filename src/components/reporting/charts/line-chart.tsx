import { EDGE, MAX_SERIES, fillFor } from "./palette.ts";

/**
 * One measure over a run of points, with a line per series.
 *
 * §6.3: "a line chart of open rate across the whole sequence with each
 * stage in its own colour." Level over time is a line; several series at
 * one x are separate lines, not stacked, because open rates do not sum to
 * anything.
 *
 * **One axis.** Open rate and click rate are both percentages and could
 * share one, but they are different questions and get different charts —
 * never two scales on one picture.
 *
 * Plain SVG, server-rendered, no library. It is in the HTML the client is
 * sent, which is also what makes it testable.
 *
 * Colour follows the stage, never its position in the drawn order: a stage
 * with no figures is still counted when the colours are handed out, so
 * filling one in later does not repaint the others.
 */

export interface LineSeries {
  label: string;
  /** One point per email, in order. Null is a gap, never a zero. */
  points: (number | null)[];
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

export function LineChart({
  series,
  caption,
  unitSuffix = "%",
  emptyMessage,
}: {
  series: LineSeries[];
  caption?: string;
  unitSuffix?: string;
  emptyMessage: string;
}) {
  const withPoints = series.filter((s) => s.points.some((p) => p !== null));
  const longest = Math.max(0, ...withPoints.map((s) => s.points.length));

  // §4's rule, in chart form: nothing drawn from nothing. An empty grid
  // with axes reads as "zero", which is a claim about the sequence rather
  // than a picture of it.
  if (withPoints.length === 0 || longest < 2) {
    return <p className="text-small text-ink/55">{emptyMessage}</p>;
  }

  const values = withPoints.flatMap((s) => s.points.filter((p): p is number => p !== null));
  const top = Math.max(...values);
  // Round the top up to something a person would choose, so the gridline
  // labels are 20/40/60 rather than 17/34/51.
  const scaleTop = Math.max(10, Math.ceil(top / 10) * 10);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (longest === 1 ? plotW / 2 : (i / (longest - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / scaleTop) * plotH;

  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(scaleTop * f));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={
          caption ??
          `${withPoints.map((s) => s.label).join(", ")} across ${longest} emails`
        }
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
              className="fill-ink/45 font-mono text-[0.6rem]"
            >
              {value}
              {unitSuffix}
            </text>
          </g>
        ))}

        {withPoints.map((line) => {
          // The colour comes from the stage's place in the WHOLE list, so
          // a stage with nothing in it still holds its hue.
          const colour = fillFor(series.indexOf(line));
          const drawn = line.points
            .map((value, i) => ({ value, i }))
            .filter((p): p is { value: number; i: number } => p.value !== null);

          return (
            <g key={line.label}>
              <polyline
                fill="none"
                stroke={colour}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={drawn.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")}
              />
              {drawn.map((p) => (
                <circle
                  key={p.i}
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

        {Array.from({ length: longest }, (_u, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-ink/45 font-mono text-[0.6rem]"
          >
            {i + 1}
          </text>
        ))}
      </svg>

      {/* Always a legend for two or more, because identity is never carried
          by colour alone — the rule the traffic lights follow too. */}
      {withPoints.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {withPoints.map((line) => (
            <li key={line.label} className="flex items-center gap-2 text-small text-ink/70">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: fillFor(series.indexOf(line)), outline: `1px solid ${EDGE}` }}
              />
              {line.label}
            </li>
          ))}
        </ul>
      ) : null}

      {caption ? (
        <figcaption className="mt-2 text-caption text-ink/55">{caption}</figcaption>
      ) : null}

      {series.length > MAX_SERIES ? (
        <p className="mt-1 text-caption text-ink/45">
          Beyond five stages the colours stop separating reliably, so the rest
          share one.
        </p>
      ) : null}
    </figure>
  );
}
