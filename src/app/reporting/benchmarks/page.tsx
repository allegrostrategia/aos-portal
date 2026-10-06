import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReportShell } from "@/components/reporting/report-shell";
import { BenchmarksForm } from "@/components/reporting/benchmarks-form";
import { Card, SectionTitle } from "@/components/ui/card";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { formatValue } from "@/lib/reporting/format";
import { getBenchmarks, getMetrics } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Benchmarks — aOS",
};

/**
 * The benchmark round trip (§7).
 *
 * Three setup answers make a prompt; somebody asks it; the reply is
 * pasted back. **aOS never produces a benchmark itself** — CLAUDE.md
 * rule 2 in its sharpest form, because a made-up industry average would
 * be drawn as a traffic light and read as fact.
 */
export default async function BenchmarksPage({
  searchParams,
}: PageProps<"/reporting/benchmarks">) {
  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  if (!ctx.canEdit) redirect(reportHref("/reporting", ctx));

  const supabase = await createClient();
  const [metrics, benchmarks, { data: setup }] = await Promise.all([
    getMetrics(),
    getBenchmarks(ctx.workspace.id),
    supabase
      .from("report_workspaces")
      .select("benchmarks_set_at, benchmarks_unmatched")
      .eq("id", ctx.workspace.id)
      .maybeSingle<{ benchmarks_set_at: string | null; benchmarks_unmatched: string[] }>(),
  ]);

  const { benchmark_business_description: what, benchmark_main_offers: offers, benchmark_country: country } =
    ctx.workspace;

  const prompt =
    what && offers && country
      ? [
          `I run ${what} in ${country}. My main offers are ${offers}.`,
          "",
          "What are typical industry benchmarks for a business like mine, for each of these?",
          "Please answer as one line per figure, with a single number each.",
          "",
          ...metrics
            .filter((m) => m.good_direction !== "none" && m.entity_type === null)
            .map((m) => `${m.label}:`),
        ].join("\n")
      : null;

  const set = metrics
    .filter((m) => benchmarks.has(m.key))
    .map((m) => ({ metric: m, value: benchmarks.get(m.key) as number }));

  return (
    <ReportShell
      ctx={ctx}
      active="overview"
      path="/reporting/benchmarks"
      title="Benchmarks"
      tagline={`WHAT TYPICAL LOOKS LIKE · ${ctx.workspace.business_name}`}
    >
      <BenchmarksForm
        workspaceId={ctx.workspace.id}
        prompt={prompt}
        setAt={setup?.benchmarks_set_at ?? null}
        unmatched={setup?.benchmarks_unmatched ?? []}
      />

      {set.length > 0 ? (
        <Card className="mt-6">
          <SectionTitle aside={`${set.length} set`}>What is stored</SectionTitle>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {set.map(({ metric, value }) => (
              <div key={metric.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-small text-ink/70">{metric.label}</dt>
                <dd className="font-mono text-body text-ink">
                  {formatValue(value, metric.unit, ctx.workspace.currency)}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
    </ReportShell>
  );
}
