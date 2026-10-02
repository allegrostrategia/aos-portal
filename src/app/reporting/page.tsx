import type { Metadata } from "next";
import Link from "next/link";

import { KpiCard } from "@/components/reporting/kpi-card";
import { PublishControl, StrategistNotes } from "@/components/reporting/notes";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { ENTRY_CATEGORIES, categoryByKey } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { categoryCompletion, getMonthFigures } from "@/lib/reporting/month-figures";
import { monthLabel } from "@/lib/reporting/months";
import { OVERVIEW_KPIS } from "@/lib/reporting/overview";

export const metadata: Metadata = {
  title: "Monthly Report — aOS",
};

/**
 * The Overview (§5.1) — the report a client opens.
 *
 * Stage 2 draws the six KPI cards, the strategist's note, and, for the team,
 * what is still to fill in and the publish control. §11.3 owns the rest of
 * the mockup: the "Look at these first" panel, the target bars and the
 * charts all need targets, benchmarks and twelve months of history, which is
 * the next stage's work rather than a thinner version of it now.
 */
export default async function ReportingOverviewPage({
  searchParams,
}: PageProps<"/reporting">) {
  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  const figures = await getMonthFigures(ctx);
  const previousLabel = ctx.month.previous
    ? monthLabel(ctx.month.previous).split(" ")[0]
    : null;

  const overviewNotes = figures.data.notes.filter(
    (n) => n.note_type === "strategist" && n.category === null,
  );
  const mine = overviewNotes.find((n) => n.author_id === ctx.reportUser.id) ?? null;

  const anyFigures = figures.data.values.size > 0;

  return (
    <ReportShell
      ctx={ctx}
      active="overview"
      path="/reporting"
      title="Monthly Report"
      tagline={ctx.month.label}
      actions={
        <PublishBadge
          kind={ctx.workspace.kind}
          publishedAt={figures.data.period?.published_at ?? null}
          show={ctx.showDraftState}
        />
      }
    >
      {!ctx.monthPublished ? (
        <Card className="mb-6">
          <SectionTitle>{ctx.month.label} isn&rsquo;t ready yet</SectionTitle>
          <p className="text-body text-ink/70">
            Your strategist is still putting this month together. You&rsquo;ll be
            told when it&rsquo;s ready to read.
          </p>
        </Card>
      ) : !anyFigures ? (
        <Card className="mb-6">
          <SectionTitle>Nothing in yet for {ctx.month.label}</SectionTitle>
          <p className="text-body text-ink/70">
            {ctx.canEdit
              ? "Start with whichever section you have the numbers for — nothing has to be done in order."
              : "Your strategist is still putting this month together."}
          </p>
        </Card>
      ) : null}

      <section aria-label="This month at a glance">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {OVERVIEW_KPIS.map((kpi) => {
            const metric = figures.byKey.get(kpi.metricKey);
            if (!metric) return null;
            const category = categoryByKey(kpi.category);
            const hidden = ctx.workspace.hidden_categories.includes(kpi.category);
            if (hidden) return null;

            return (
              <KpiCard
                key={kpi.metricKey}
                label={kpi.label}
                value={figures.figure(kpi.metricKey)}
                previous={figures.previousFigure(kpi.metricKey)}
                unit={metric.unit}
                goodDirection={metric.good_direction}
                currency={ctx.workspace.currency}
                previousLabel={previousLabel}
                href={
                  category && category.stage <= 2
                    ? reportHref(`/reporting/${category.slug}`, ctx)
                    : undefined
                }
              />
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StrategistNotes
          notes={overviewNotes}
          canWrite={ctx.canEdit && ctx.workspace.kind === "retainer"}
          workspaceId={ctx.workspace.id}
          month={ctx.month.month}
          category=""
          mine={mine}
          emptyMessage="Your strategist hasn't written this month's note yet."
        />

        <div className="flex flex-col gap-6">
          {ctx.canEdit ? <StillToFill ctx={ctx} figures={figures} /> : null}
          {ctx.canPublish && ctx.workspace.kind === "retainer" ? (
            <PublishControl
              workspaceId={ctx.workspace.id}
              month={ctx.month.month}
              monthLabel={ctx.month.label}
              publishedAt={figures.data.period?.published_at ?? null}
            />
          ) : null}
        </div>
      </div>

    </ReportShell>
  );
}

/**
 * What is still to fill in (§8.1: "Any visible category without its core
 * fields filled keeps its orange marker until it's done").
 *
 * Only for the people who fill it in. A retainer client seeing a checklist of
 * their strategist's homework is not information they can act on.
 */
function StillToFill({
  ctx,
  figures,
}: {
  ctx: Awaited<ReturnType<typeof resolveReportContext>>;
  figures: Awaited<ReturnType<typeof getMonthFigures>>;
}) {
  const rows = ENTRY_CATEGORIES.filter(
    (c) => !ctx.workspace.hidden_categories.includes(c.key),
  ).map((category) => ({
    category,
    // Shared, because Offers stores its figures per offer and a month-level
    // lookup finds none of them.
    ...categoryCompletion(figures, category.key),
  }));

  const done = rows.filter((r) => r.total > 0 && r.filled === r.total).length;

  return (
    <Card>
      <SectionTitle aside={`${done} of ${rows.length} done`}>
        Still to fill in
      </SectionTitle>
      <ul className="flex flex-col gap-1">
        {rows.map(({ category, filled, total }) => {
          const complete = total > 0 && filled === total;
          return (
            <li key={category.key}>
              <Link
                href={reportHref(`/reporting/enter/${category.slug}`, ctx)}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition hover:bg-cream-deep"
              >
                <span className="flex items-center gap-2.5 text-body text-ink">
                  <span
                    aria-hidden
                    className={`size-2.5 shrink-0 rounded-full ${
                      complete
                        ? "bg-[#1f7a4d]"
                        : filled > 0
                          ? "bg-orange"
                          : "border border-ink/25"
                    }`}
                  />
                  {category.label}
                </span>
                <span className="font-mono text-caption text-ink/55">
                  {filled}/{total}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Eyebrow className="mt-4">Core fields only</Eyebrow>
    </Card>
  );
}
