import { Card, SectionTitle } from "@/components/ui/card";
import type { LaunchStage } from "@/lib/reporting/launch-queries";

/**
 * §6.1's stages, in order, with their promo and live dates.
 *
 * A row per stage rather than a drawn calendar. The thing a reader wants
 * is the order and the dates, and a scaled timeline of four stages over
 * six weeks is mostly empty space with the labels too small to read —
 * worse at 390px, where it would need its own second design.
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

  return (
    <Card className={className}>
      <SectionTitle aside={`${stages.length} ${stages.length === 1 ? "stage" : "stages"}`}>
        How it ran
      </SectionTitle>
      <ol className="flex flex-col">
        {stages.map((stage, i) => {
          const promo = when(stage.promo_start, stage.promo_end);
          const live = when(stage.live_start, stage.live_end);

          return (
            <li
              key={stage.id}
              className="flex gap-4 border-b border-ink/8 py-3 last:border-b-0 last:pb-0 first:pt-0"
            >
              <span className="font-mono text-caption text-ink/40 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink">
                  {stage.name}
                  {/* The one stage the conversion rate is measured against
                      — §6.4 — so it says which it is rather than leaving
                      the reader to guess from a figure elsewhere. */}
                  {stage.is_main_selling_stage ? (
                    <span className="ml-2 rounded-full bg-gold/30 px-2 py-0.5 text-caption font-medium text-ink">
                      Where the selling happened
                    </span>
                  ) : null}
                </p>
                <p className="text-small text-ink/55">
                  {STAGE_LABEL[stage.stage_type] ?? stage.stage_type}
                  {stage.live_days
                    ? ` · ${stage.live_days} ${stage.live_days === 1 ? "day" : "days"}`
                    : null}
                  {promo ? ` · promo ${promo}` : null}
                  {live ? ` · live ${live}` : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
