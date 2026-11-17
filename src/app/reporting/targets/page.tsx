import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReportShell } from "@/components/reporting/report-shell";
import { Card, SectionTitle } from "@/components/ui/card";
import { TargetsForm, type TargetRow } from "@/components/reporting/targets-form";
import { CATEGORIES, STAGE_3 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { getMetrics, type ReportEntity } from "@/lib/reporting/queries";
import { visibleMetrics } from "@/lib/reporting/month-figures";
import { platformAsks, platformLabel } from "@/lib/reporting/platform-metrics";
import { platformsOf } from "@/lib/reporting/platforms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Targets — aOS",
};

/**
 * Setting a client's targets (§7).
 *
 * Its own page rather than a panel on each category, because setting
 * them is a sitting-down job done occasionally, and the thing that makes
 * it bearable is seeing them all at once.
 *
 * Not a client's screen. A retainer client's targets are set by their
 * strategist (§2), and a self-serve member sets their own — which is the
 * same page with a different person in front of it, so the gate is
 * `canEdit` rather than `isAdmin`.
 */
export default async function TargetsPage({ searchParams }: PageProps<"/reporting/targets">) {
  // Stage 3, so no route until the flag moves — §13's one-route rule
  // applies to a page nobody should reach yet as much as to a tab.
  if (!STAGE_3) notFound();

  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  if (!ctx.canEdit) redirect(reportHref("/reporting", ctx));

  const supabase = await createClient();
  const [metrics, { data: targets }, { data: entityRows }] = await Promise.all([
    getMetrics(),
    supabase
      .from("report_targets")
      .select("metric_key, entity_id, month, target_value")
      .eq("workspace_id", ctx.workspace.id)
      .returns<
        {
          metric_key: string;
          entity_id: string | null;
          month: string | null;
          target_value: number;
        }[]
      >(),
    // **The rows a target can be set against** (Nina, 11 November: a
    // target per platform, and the same machinery for offers and
    // campaigns). Live ones only: a retired campaign is a record, not
    // something to aim at next month.
    supabase
      .from("report_entities")
      .select("id, name, entity_type, active, sort_order, platform_kind")
      .eq("workspace_id", ctx.workspace.id)
      .eq("active", true)
      .order("sort_order")
      .returns<
        Pick<
          ReportEntity,
          "id" | "name" | "entity_type" | "active" | "sort_order" | "platform_kind"
        >[]
      >(),
  ]);

  const key = (metricKey: string, entityId: string | null) => `${metricKey}|${entityId ?? ""}`;
  const standing = new Map(
    (targets ?? [])
      .filter((t) => t.month === null)
      .map((t) => [key(t.metric_key, t.entity_id), t.target_value]),
  );
  const thisMonth = new Map(
    (targets ?? [])
      .filter((t) => t.month === ctx.month.month)
      .map((t) => [key(t.metric_key, t.entity_id), t.target_value]),
  );

  // Platforms in the pill's order, so the blocks on this screen and the
  // tabs on Social Media name them in the same order.
  const entitiesByType = (type: string) =>
    type === "social_platform"
      ? platformsOf(entityRows ?? []).map((p) => ({ id: p.id, name: p.name }))
      : (entityRows ?? [])
          .filter((e) => e.entity_type === type)
          .map((e) => ({ id: e.id, name: e.name }));

  // The same rule the report reads by, so a client who does not track
  // hours is not offered a target for an hourly rate nobody will ever
  // see (Nina, 3 November).
  const visible = visibleMetrics(metrics, ctx.workspace);

  const groups = CATEGORIES.filter((c) => c.key !== "overview")
    .filter((c) => !ctx.workspace.hidden_categories.includes(c.key))
    .map((category) => ({
      category: category.key,
      label: category.label,
      // A target for a figure that is neither good up nor good down is
      // not a target, it is a number sitting there.
      //
      // **A per-row figure gets one target per row** (11 November). It
      // used to get none at all: the filter below said `entity_type ===
      // null`, which quietly meant Social Media — every one of whose
      // figures hangs off a platform — could not be given a target by
      // anybody. Nina asking for a target per platform is what found it.
      rows: visible
        .filter((m) => m.category === category.key && m.good_direction !== "none")
        .flatMap((metric): TargetRow[] => {
          if (metric.entity_type === null) {
            return [
              {
                metric,
                standing: standing.get(key(metric.key, null)) ?? null,
                thisMonth: thisMonth.get(key(metric.key, null)) ?? null,
              },
            ];
          }
          /**
           * **A platform is only offered the figures it is asked for**
           * (§5.2's per-platform sets, 17 November). Without this, every
           * platform was offered all forty Social Media figures — a
           * target for LinkedIn's save rate, which is a box that can be
           * filled in for a figure that is never drawn.
           *
           * A target somebody has ALREADY set stays on the list whatever
           * the set says, so a kind corrected afterwards leaves nothing
           * set-but-invisible. Same rule as the entry screen's `held`,
           * for the same reason.
           */
          if (metric.entity_type === "social_platform") {
            return platformsOf(entityRows ?? [])
              .filter(
                (p) =>
                  platformAsks(metric.key, p.platform_kind) ||
                  standing.has(key(metric.key, p.id)) ||
                  thisMonth.has(key(metric.key, p.id)),
              )
              .map((p) => ({
                // In that platform's own words: Subscribers on a
                // channel, Page visits on a Facebook page.
                metric: { ...metric, label: platformLabel(metric, p.platform_kind) },
                entity: { id: p.id, name: p.name },
                standing: standing.get(key(metric.key, p.id)) ?? null,
                thisMonth: thisMonth.get(key(metric.key, p.id)) ?? null,
              }));
          }

          return entitiesByType(metric.entity_type).map((entity) => ({
            metric,
            entity,
            standing: standing.get(key(metric.key, entity.id)) ?? null,
            thisMonth: thisMonth.get(key(metric.key, entity.id)) ?? null,
          }));
        }),
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <ReportShell
      ctx={ctx}
      active="overview"
      path="/reporting/targets"
      title="Targets"
      tagline={`WHAT GOOD LOOKS LIKE · ${ctx.month.label}`}
    >
      <Card className="mb-6">
        <SectionTitle>How these are used</SectionTitle>
        <p className="text-body text-ink/70">
          Up to five with a target set appear on the Overview as a progress bar, and
          every figure with one is marked against it. A target set for{" "}
          {ctx.month.label} only wins over the standing one for that month.
        </p>
      </Card>

      <TargetsForm
        workspaceId={ctx.workspace.id}
        month={ctx.month.month}
        monthLabel={ctx.month.label}
        currency={ctx.workspace.currency}
        groups={groups}
      />
    </ReportShell>
  );
}
