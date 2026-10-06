import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReportShell } from "@/components/reporting/report-shell";
import { Card, SectionTitle } from "@/components/ui/card";
import { TargetsForm, type TargetRow } from "@/components/reporting/targets-form";
import { CATEGORIES } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { getMetrics } from "@/lib/reporting/queries";
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
  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  if (!ctx.canEdit) redirect(reportHref("/reporting", ctx));

  const supabase = await createClient();
  const [metrics, { data: targets }] = await Promise.all([
    getMetrics(),
    supabase
      .from("report_targets")
      .select("metric_key, month, target_value")
      .eq("workspace_id", ctx.workspace.id)
      .returns<{ metric_key: string; month: string | null; target_value: number }[]>(),
  ]);

  const standing = new Map(
    (targets ?? []).filter((t) => t.month === null).map((t) => [t.metric_key, t.target_value]),
  );
  const thisMonth = new Map(
    (targets ?? [])
      .filter((t) => t.month === ctx.month.month)
      .map((t) => [t.metric_key, t.target_value]),
  );

  const groups = CATEGORIES.filter((c) => c.key !== "overview")
    .filter((c) => !ctx.workspace.hidden_categories.includes(c.key))
    .map((category) => ({
      category: category.key,
      label: category.label,
      rows: metrics
        .filter((m) => m.category === category.key)
        // A target for a figure that is neither good up nor good down is
        // not a target. Nor is one for a figure typed per offer or per
        // campaign — those belong to the row, and §7's bar is one figure.
        .filter((m) => m.good_direction !== "none" && m.entity_type === null)
        .map(
          (metric): TargetRow => ({
            metric,
            standing: standing.get(metric.key) ?? null,
            thisMonth: thisMonth.get(metric.key) ?? null,
          }),
        ),
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
