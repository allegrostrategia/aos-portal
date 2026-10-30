import { EDGE, SEPARATOR, fillFor } from "./palette.ts";

/**
 * The mockups' funnel: stacked trapezoids narrowing stage by stage, with
 * the figure and the drop-off beside each one.
 *
 * **Why a funnel and not four bars.** Bars are the honest default for four
 * numbers, and this is the case where the shape carries something bars do
 * not: each stage is a subset of the one above it, so the narrowing IS the
 * measurement. The mockups draw it this way on both the Social Media report
 * and the launch page, and Nina approved them.
 *
 * **The width is the proportion, not a decoration.** Each stage's top edge
 * is the previous stage's bottom edge, so the slope between two stages is
 * the drop between them — which is why a stage that loses nobody has
 * straight sides. Clamped to a floor of 8% so a stage with one person left
 * is still a shape you can see and click, with the number beside it saying
 * what the shape cannot.
 *
 * Plain SVG, server-rendered, no library — the same as the other three.
 */

export interface FunnelStage {
  label: string;
  /** Null means not entered. The stage is listed and not drawn. */
  value: number | null;
}

const HEIGHT = 44;
const GAP = 4;
/** Narrow enough to read as a funnel, wide enough for the top to be a lid. */
const WIDTH = 180;
/** A sliver still has to be visible and still has to be a target. */
const MIN_SHARE = 0.08;

export function FunnelChart({
  stages,
  caption,
}: {
  stages: FunnelStage[];
  caption?: string;
}) {
  const drawn = stages.filter((s): s is { label: string; value: number } => s.value !== null);

  if (drawn.length < 2) {
    return (
      <p className="text-body text-ink/60">
        Two stages have to be filled in before there is a funnel to draw.
      </p>
    );
  }

  // The top stage is the whole width; every other stage is its share of it.
  const top = drawn[0].value;
  const share = (v: number) =>
    top > 0 ? Math.max(MIN_SHARE, Math.min(1, v / top)) : MIN_SHARE;

  const totalHeight = drawn.length * HEIGHT + (drawn.length - 1) * GAP;

  return (
    <div>
      <div className="flex items-start gap-4">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${WIDTH} ${totalHeight}`}
          width={WIDTH}
          height={totalHeight}
          className="shrink-0"
        >
          {drawn.map((stage, i) => {
            const topShare = share(stage.value);
            // The bottom edge is the next stage's width, so the two meet.
            const bottomShare = i + 1 < drawn.length ? share(drawn[i + 1].value) : topShare;

            const y = i * (HEIGHT + GAP);
            const halfTop = (WIDTH * topShare) / 2;
            const halfBottom = (WIDTH * bottomShare) / 2;
            const mid = WIDTH / 2;

            return (
              <polygon
                key={stage.label}
                points={[
                  `${mid - halfTop},${y}`,
                  `${mid + halfTop},${y}`,
                  `${mid + halfBottom},${y + HEIGHT}`,
                  `${mid - halfBottom},${y + HEIGHT}`,
                ].join(" ")}
                fill={fillFor(i)}
                // The same obligation every pale fill carries: an edge, so
                // the shape has a boundary where it meets the card, and a
                // separator so two stages never touch.
                stroke={EDGE}
                strokeWidth="1"
                style={{ paintOrder: "stroke" }}
              />
            );
          })}
          {/* The separators, drawn over the joins. */}
          {drawn.slice(0, -1).map((stage, i) => (
            <rect
              key={`gap-${stage.label}`}
              x="0"
              y={i * (HEIGHT + GAP) + HEIGHT}
              width={WIDTH}
              height={GAP}
              fill={SEPARATOR}
            />
          ))}
        </svg>

        {/* The numbers, which is where the reader actually reads them. A
            list, so the funnel is a picture of something already said in
            text rather than the only place it is said. */}
        <ul className="min-w-0 flex-1">
          {drawn.map((stage, i) => {
            const previous = i > 0 ? drawn[i - 1].value : null;
            const kept =
              previous && previous > 0 ? Math.round((stage.value / previous) * 100) : null;

            return (
              <li
                key={stage.label}
                className="flex items-baseline justify-between gap-3 border-b border-ink/8 last:border-0"
                style={{ height: HEIGHT + (i < drawn.length - 1 ? GAP : 0) }}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-body font-medium text-ink">
                    {stage.value.toLocaleString("en-GB")}
                  </span>
                  <span className="block truncate text-caption text-ink/55">{stage.label}</span>
                </span>
                {kept === null ? null : (
                  <span className="shrink-0 font-mono text-caption text-ink/55">
                    {/* What reached this stage, not what was lost: the
                        mockup's own reading, and the one people quote. */}
                    {kept}%
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {caption ? <p className="mt-3 text-caption text-ink/55">{caption}</p> : null}
    </div>
  );
}
