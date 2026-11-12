import type { CategoryKey } from "./categories.ts";
import { highlights } from "./highlights.ts";
import type { MonthFigures } from "./month-figures.ts";
import type { ReportContext } from "./context.ts";

/**
 * §7's two panels — "Look at these first" and "What went WELL" — built
 * once for both the screen and the printed report.
 *
 * **Lifted out of the Overview on 14 November**, when the PDF had to
 * carry them too. Sixty lines of selection logic copied into a second
 * page is §9's disagreement waiting to happen: the panels would have
 * said one thing on screen and another on paper, and nothing would
 * have caught it.
 */
export function overviewPanels({
  ctx,
  figures,
  targets,
}: {
  ctx: ReportContext;
  figures: MonthFigures;
  targets: Map<string, number>;
}) {
  //
  // **A figure kept per platform is judged per platform** (Nina, 11
  // November). Until today the filter below was `entity_type === null`,
  // which quietly meant no Social Media figure could ever reach the
  // Focus areas, the target bars or the traffic lights — all three read
  // month-level figures and every social figure hangs off a platform.
  //
  // One platform is the normal case and reads exactly as it did: the
  // key and the label are the metric's own. With two or more, each
  // platform gets its own entry, keyed `metric|platform` so the panel's
  // own de-duplication compares Instagram with Instagram, and labelled
  // "Posts published on LinkedIn" so a reader knows whose news it is.
  const named = figures.platforms.length > 1;
  const visibleHere = (metric: { category: CategoryKey; good_direction: string }) =>
    metric.good_direction !== "none" &&
    !ctx.workspace.hidden_categories.includes(metric.category);

  const monthLevel = figures.metrics
    .filter((metric) => metric.entity_type === null && visibleHere(metric))
    .map((metric) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      goodDirection: metric.good_direction,
      value: figures.figure(metric.key),
      previous: figures.previousFigure(metric.key),
      target: targets.get(`${metric.key}|`) ?? null,
      currency: ctx.workspace.currency,
    }));

  const perPlatform = figures.metrics
    .filter((metric) => metric.entity_type === "social_platform" && visibleHere(metric))
    .flatMap((metric) =>
      figures.byPlatform.map(({ platform, figure, previousFigure }) => ({
        key: named ? `${metric.key}|${platform.id}` : metric.key,
        label: named ? `${metric.label} on ${platform.name}` : metric.label,
        unit: metric.unit,
        goodDirection: metric.good_direction,
        value: figure(metric.key),
        previous: previousFigure(metric.key),
        target: targets.get(`${metric.key}|${platform.id}`) ?? null,
        currency: ctx.workspace.currency,
      })),
    );

  const panels = highlights([...monthLevel, ...perPlatform]);

  return panels;
}
