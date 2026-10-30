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
  /**
   * How a LATER step refers back to this one — "of those at the pitch".
   *
   * Carried by the step rather than written on the step that quotes it,
   * because which step comes before which is not fixed: a stage with no
   * "live at end of pitch" figure drops that row entirely, and a hard-coded
   * "of those at the pitch" on the row below would then be describing the
   * people who merely turned up. The phrase travels with the number it
   * belongs to, so it cannot end up attached to a different one.
   *
   * Only used on a row that carries `also`; everywhere else a bare
   * percentage is less to read and says the same thing.
   */
  of?: string;
  /**
   * A second share on this row, already formatted by the caller.
   *
   * **A string, not a number, and worked out somewhere else on purpose.**
   * Where a step's share of the step above it is not the figure a reader
   * will quote — the launch page's "Bought" row, whose headline
   * conversion rate is measured against sign-ups — the row has to show
   * both or it contradicts a card on the same screen. Taking the display
   * text straight from whatever produced that card is what makes the two
   * agree by construction rather than by two sums happening to round the
   * same way.
   */
  also?: { display: string; of: string };
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
  // `FunnelStage &` rather than a fresh shape: spelling the two fields out
  // narrowed the rest of the stage away, so a row's own wording was not
  // there to read by the time it was wanted.
  const drawn = stages.filter(
    (s): s is FunnelStage & { value: number } => s.value !== null,
  );

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
    // Capped. The numbers list takes the rest of the row, so on a
    // full-width card the percentage ends up at the far edge of the card
    // with the label it belongs to half a screen away.
    <div className="max-w-xl">
      <div className="flex items-start gap-4">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${WIDTH} ${totalHeight}`}
          height={totalHeight}
          /**
           * Narrower on a phone, and squashed rather than scaled.
           *
           * A fixed 180px leaves about 144px for the numbers beside it on
           * a 390px screen, which was enough while every row was a bare
           * "47%" and is not enough now one of them carries two shares in
           * words — the list was pushed to nothing and the labels
           * disappeared.
           *
           * `preserveAspectRatio="none"` because the height must not move
           * with the width: each trapezoid is drawn at the same height as
           * the list row beside it, and a uniformly scaled SVG would take
           * the rows out of line with their own numbers. Squashing costs
           * nothing the chart was saying — every width here is a share of
           * the width above it, and that survives.
           */
          preserveAspectRatio="none"
          className="w-[108px] shrink-0 sm:w-[180px]"
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
            const above = i > 0 ? drawn[i - 1] : null;
            const kept =
              above && above.value > 0
                ? Math.round((stage.value / above.value) * 100)
                : null;

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
                {kept === null && !stage.also ? null : (
                  // Two short lines rather than one long one. The list
                  // shares the row with the funnel, so on a phone it has
                  // about 145px to work in — "7% of those at the pitch ·
                  // 3.3% of sign-ups" on one line is three wrapped lines
                  // there, and the row's height is fixed to the trapezoid
                  // beside it and cannot grow to take them.
                  <span className="shrink-0 text-right font-mono text-caption text-ink/55">
                    {/* What reached this stage, not what was lost: the
                        mockup's own reading, and the one people quote. */}
                    {kept === null ? null : (
                      <span className="block">
                        {kept}%{stage.also && above?.of ? ` ${above.of}` : null}
                      </span>
                    )}
                    {stage.also ? (
                      <span className="block">
                        {stage.also.display} {stage.also.of}
                      </span>
                    ) : null}
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
