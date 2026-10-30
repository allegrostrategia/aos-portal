import { EDGE, SINGLE, fillFor } from "./palette.ts";

/**
 * One measure across a handful of named things — leads by source, effective
 * hourly rate by offer.
 *
 * **One hue by default, not one per bar.** The bars are the same measure;
 * colouring them differently would say they were different kinds of thing.
 * A rainbow here is the commonest chart mistake after the dual axis.
 *
 * `colourByCategory` is the one exception, and it is narrow: a chart whose
 * categories ARE the identities, where the same five colours are already
 * carrying those identities in a donut or a legend on the same screen —
 * leads by source, revenue by offer. There the hue is the entity, not the
 * rank, so it means something. A chart of one measure across days or stages
 * must not pass it.
 *
 * Horizontal, because the names are words: a vertical bar chart with five
 * source names underneath it either rotates the labels or truncates them,
 * and both are worse than turning the chart on its side. It also means the
 * phone layout is the desktop layout with less width, rather than a second
 * design.
 *
 * Plain SVG and no library. Server-rendered, so it is in the HTML the client
 * is sent — which is also what makes it testable.
 */

export interface BarDatum {
  label: string;
  /** Null means not entered. It gets a row and no bar, never a zero. */
  value: number | null;
  /** The formatted figure, done by the caller so this never formats money. */
  display: string;
  /** Said instead of a bar when `value` is null. */
  missingNote?: string;
}

export function BarChart({
  data,
  max,
  target,
  targetLabel,
  caption,
  colourByCategory = false,
}: {
  data: BarDatum[];
  /** The scale's top. Passed in so two charts can share one scale. */
  max?: number;
  /** A reference line — the client's target hourly rate (§5.9). */
  target?: number | null;
  targetLabel?: string;
  caption?: string;
  /** See the note above: only where the categories are the identities. */
  colourByCategory?: boolean;
}) {
  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  // The target belongs inside the scale, or a bar under it has no line to be
  // under and the chart quietly stops making its point.
  const ceiling = Math.max(max ?? 0, ...values, target ?? 0);

  if (values.length === 0) {
    return (
      <p className="text-body text-ink/60">
        Nothing entered for this month yet, so there is nothing to draw.
      </p>
    );
  }

  const width = (value: number) => (ceiling > 0 ? (value / ceiling) * 100 : 0);
  const targetAt = target && ceiling > 0 ? (target / ceiling) * 100 : null;

  return (
    // Capped: on a full-width card a twelve-lead bar runs 1300px, which is a
    // great deal of ink for one number and makes the ends hard to compare.
    <div className="max-w-3xl">
      <ul className="flex flex-col gap-3">
        {data.map((datum, index) => (
          <li key={datum.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-small text-ink">{datum.label}</span>
              <span className="font-mono text-small text-ink/70">
                {datum.value === null ? (datum.missingNote ?? datum.display) : datum.display}
              </span>
            </div>

            {datum.value === null ? null : (
              <div className="relative mt-1.5 h-3">
                {/* The track, so a short bar still reads as short of
                    something rather than as the whole chart. */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--aos-cream-deep)" }}
                />
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${width(datum.value)}%`,
                    // The row order is the caller's and is stable, so the
                    // nth source keeps the nth colour: a month where one
                    // source drops to nothing does not repaint the others.
                    background: colourByCategory ? fillFor(index) : SINGLE,
                    // Pale fills need an edge; navy does not, but the same
                    // hairline keeps every mark in the product consistent.
                    boxShadow: `inset 0 0 0 1px ${EDGE}`,
                  }}
                />
                {targetAt === null ? null : (
                  <div
                    aria-hidden
                    className="absolute inset-y-[-3px] w-0 border-l-2 border-dashed border-ink/55"
                    style={{ left: `${targetAt}%` }}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {targetAt === null ? null : (
        <p className="mt-3 flex items-center gap-2 text-caption text-ink/55">
          <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-dashed border-ink/55" />
          {targetLabel}
        </p>
      )}

      {caption ? <p className="mt-2 text-caption text-ink/55">{caption}</p> : null}
    </div>
  );
}
