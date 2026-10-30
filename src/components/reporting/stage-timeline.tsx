import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle, type ReportIconName, toneFor } from "./icons";
import type { LaunchStage } from "@/lib/reporting/launch-queries";

/**
 * §6.1's stages, in order, with their promo and live dates.
 *
 * **Horizontal on desktop, stacked on phone** (Nina, 30 October, against the
 * approved mockup). The first build was a list at both widths, on the
 * argument that a scaled timeline of four stages over six weeks is mostly
 * empty space. That argument was about a *scaled* timeline — one where the
 * gap between two stages is the gap in days. This is not that: every stage
 * takes an equal share of the row, so the drawing says the order and
 * nothing it cannot support, and the dates underneath say the rest.
 *
 * On a phone the row would give each stage 60px, so it becomes the list it
 * always was, with the disc where the two-digit index used to be.
 *
 * The rail is a hairline behind the discs, drawn in halves: the left half
 * of every stage but the first, the right half of every stage but the last.
 * One absolute element per side rather than one line across the whole row,
 * because the row is a flex container whose items are sized by their own
 * text — there is no "centre of the first disc" to measure from in CSS.
 * Each half reaches half a column plus the gutter, or the rail breaks at
 * every column edge and reads as four separate stages rather than one run.
 */

const STAGE_LABEL: Record<string, string> = {
  challenge: "Challenge",
  masterclass: "Masterclass",
  webinar: "Webinar",
  workshop: "Workshop",
  waitlist: "Waitlist",
  open_cart: "Open cart",
  other: "Other",
};

/**
 * A glyph per kind of stage.
 *
 * Decorative, like every other icon in the report: the kind is written in
 * words directly underneath. The mockup draws a laptop for the masterclass
 * and a trolley for the open cart; the set has neither, so each goes to the
 * nearest thing it does have rather than to two new glyphs drawn for one
 * row.
 */
const STAGE_ICON: Record<string, ReportIconName> = {
  challenge: "target",
  masterclass: "people",
  webinar: "people",
  workshop: "notes",
  waitlist: "clock",
  open_cart: "revenue",
  other: "star",
};

function when(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const day = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  if (from && to && from !== to) return `${day(from)} – ${day(to)}`;
  return day((from ?? to) as string);
}

export function StageTimeline({
  stages,
  className = "",
}: {
  stages: LaunchStage[];
  className?: string;
}) {
  if (stages.length === 0) return null;

  const last = stages.length - 1;

  return (
    <Card className={className}>
      <SectionTitle
        icon={<IconCircle name="clock" tone="sky" />}
        aside={`${stages.length} ${stages.length === 1 ? "stage" : "stages"}`}
      >
        How it ran
      </SectionTitle>
      <ol className="flex flex-col sm:flex-row sm:items-start">
        {stages.map((stage, i) => {
          const promo = when(stage.promo_start, stage.promo_end);
          const live = when(stage.live_start, stage.live_end);

          return (
            <li
              key={stage.id}
              className="flex gap-4 border-b border-ink/8 py-3 first:pt-0 last:border-b-0 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:border-b-0 sm:px-2 sm:py-0 sm:text-center"
            >
              <div className="relative flex shrink-0 justify-center sm:w-full">
                {/* The rail. Hairline rather than a stroke, so it sits
                    behind the discs as furniture and not as a mark. */}
                {i > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -left-2 hidden h-px w-[calc(50%+0.5rem)] bg-ink/15 sm:block"
                  />
                ) : null}
                {i < last ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -right-2 hidden h-px w-[calc(50%+0.5rem)] bg-ink/15 sm:block"
                  />
                ) : null}
                {/* Over the rail, and on the card's own colour so the line
                    stops at the disc rather than running under it. */}
                <span className="relative rounded-full bg-card">
                  <IconCircle
                    name={STAGE_ICON[stage.stage_type] ?? "star"}
                    tone={toneFor(i)}
                  />
                </span>
              </div>

              <div className="min-w-0 flex-1 sm:mt-3 sm:w-full sm:flex-none">
                <p className="text-body font-medium text-ink">{stage.name}</p>
                <p className="text-small text-ink/55">
                  {STAGE_LABEL[stage.stage_type] ?? stage.stage_type}
                  {stage.live_days
                    ? ` · ${stage.live_days} ${stage.live_days === 1 ? "day" : "days"}`
                    : null}
                </p>
                {/* A line each rather than one line joined by a dot. In a
                    column a quarter of the card wide, the joined version
                    wraps wherever it happens to run out and the four
                    stages end up ragged against each other. */}
                {promo ? (
                  <p className="mt-0.5 font-mono text-caption text-ink/55">promo {promo}</p>
                ) : null}
                {live ? (
                  <p className="font-mono text-caption text-ink/55">live {live}</p>
                ) : null}
                {/* The one stage the conversion rate is measured against
                    — §6.4 — so it says which it is rather than leaving the
                    reader to guess from a figure elsewhere. */}
                {stage.is_main_selling_stage ? (
                  <p className="mt-1.5">
                    <span className="inline-block rounded-full bg-gold/30 px-2 py-0.5 text-caption font-medium text-ink">
                      Where the selling happened
                    </span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
