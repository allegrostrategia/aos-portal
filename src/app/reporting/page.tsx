import type { Metadata } from "next";
import Link from "next/link";

import { KpiCard } from "@/components/reporting/kpi-card";
import { PublishControl, StrategistNotes } from "@/components/reporting/notes";
import { Objectives } from "@/components/reporting/objectives";
import { ClientReplies } from "@/components/reporting/replies";
import { BarChart } from "@/components/reporting/charts/bar-chart";
import { leadsBySource } from "@/lib/reporting/chart-data";
import { getBenchmarks, getTargets } from "@/lib/reporting/queries";
import { lightFor } from "@/lib/reporting/lights";
import { PANELS, highlights } from "@/lib/reporting/highlights";
import { buttonClasses } from "@/components/ui/button";
import { formatValue } from "@/lib/reporting/format";
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

  const objectives = figures.data.notes.filter((n) => n.note_type === "objective");
  // Oldest first: a thread read newest-first stops being a conversation.
  // `getMonthData` already orders by created_at, so this only selects.
  const replies = figures.data.notes.filter((n) => n.note_type === "client_reply");

  // The reply box is the client's, on a month they can actually read. The
  // team reads the thread and answers in the note above it (§8: the client
  // reply is theirs; "Notes from your strategist" is Nina's half).
  const canReply =
    !ctx.canEdit && ctx.workspace.kind === "retainer" && ctx.monthPublished;

  const period = figures.data.period ?? null;

  // §7's bar: up to five targets, in the metric list's own order so the
  // same five stay in the same places month to month.
  const [targets, benchmarks] = await Promise.all([
    getTargets(ctx.workspace.id, ctx.month.month),
    getBenchmarks(ctx.workspace.id),
  ]);
  // §7's two panels. Every word in them is Nina's, from one file.
  const panels = highlights(
    figures.metrics
      .filter((metric) => metric.entity_type === null && metric.good_direction !== "none")
      .filter((metric) => !ctx.workspace.hidden_categories.includes(metric.category))
      .map((metric) => ({
        label: metric.label,
        unit: metric.unit,
        goodDirection: metric.good_direction,
        value: figures.figure(metric.key),
        previous: figures.previousFigure(metric.key),
        target: targets.get(`${metric.key}|`) ?? null,
        currency: ctx.workspace.currency,
      })),
  );

  const targetRows = figures.metrics
    .filter((metric) => targets.has(`${metric.key}|`))
    .map((metric) => ({
      metric,
      target: targets.get(`${metric.key}|`) as number,
      value: figures.figure(metric.key),
    }))
    .filter((row) => row.value !== null)
    .slice(0, 5);

  // §5.1's own chart. Drawn from the figures, never from its own sums.
  const leads = ctx.workspace.hidden_categories.includes("leads_conversions")
    ? []
    : leadsBySource(figures);

  const leadsCard =
    ctx.monthPublished && leads.length > 0 ? (
      <Card>
        {/* No month aside here: in the client's narrow column the title
            wraps into it, and the month is already in the page header and
            on the picker. The Leads page keeps it — the card is full width
            there and it has room. */}
        <SectionTitle>Where the leads came from</SectionTitle>
        <BarChart data={leads} caption="New leads this month, by source." />
      </Card>
    ) : null;

  /**
   * What sits beside the written half of the page.
   *
   * An editor's column holds the two things only they see. **A client's held
   * nothing at all**, so the notes, objectives and replies sat at two
   * thirds width with an empty third beside them (Dom, 5 Oct). The chart
   * moves in there rather than the prose stretching across: a note card at
   * 1300px is a worse read than one at 850, so widening it would have
   * traded one problem for another.
   *
   * Null when there is neither — a client on a month with no lead figures.
   * The grid then collapses to one column held to a readable measure, which
   * looks deliberate rather than like a column that failed to load.
   */
  const sidebar = ctx.canEdit ? (
    <>
      <StillToFill ctx={ctx} figures={figures} />
      {ctx.canPublish && ctx.workspace.kind === "retainer" ? (
        <PublishControl
          workspaceId={ctx.workspace.id}
          month={ctx.month.month}
          monthLabel={ctx.month.label}
          publishedAt={period?.published_at ?? null}
          emailSentAt={period?.email_sent_at ?? null}
          emailError={period?.email_error ?? null}
          emailTo={period?.email_to ?? null}
        />
      ) : null}
    </>
  ) : (
    leadsCard
  );

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
                light={lightFor({
                  value: figures.figure(kpi.metricKey),
                  target: targets.get(`${kpi.metricKey}|`),
                  benchmark: benchmarks.get(kpi.metricKey),
                  lastMonth: figures.previousFigure(kpi.metricKey),
                  goodDirection: metric.good_direction,
                })}
              />
            );
          })}
        </div>
      </section>

      {panels.attention.length > 0 || panels.wins.length > 0 ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {panels.attention.length > 0 ? (
            <Card>
              <SectionTitle>{PANELS.attention}</SectionTitle>
              <ul className="flex flex-col gap-2.5">
                {panels.attention.map((item) => (
                  <li key={item.text} className="text-body text-ink/80">
                    {item.text}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {panels.wins.length > 0 ? (
            <Card>
              <SectionTitle>{PANELS.wins}</SectionTitle>
              <ul className="flex flex-col gap-2.5">
                {panels.wins.map((item) => (
                  <li key={item.text} className="text-body text-ink/80">
                    {item.text}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {targetRows.length > 0 ? (
        <Card className="mt-8">
          <SectionTitle
            aside={
              ctx.canEdit ? (
                <Link
                  href={reportHref("/reporting/targets", ctx)}
                  className={buttonClasses("secondary", "sm")}
                >
                  Set targets
                </Link>
              ) : undefined
            }
          >
            How this month is going
          </SectionTitle>
          <ul className="mt-1 flex flex-col gap-4">
            {targetRows.map(({ metric, target, value }) => {
              const share = target > 0 ? ((value ?? 0) / target) * 100 : 0;
              const good =
                metric.good_direction === "up" ? share >= 100 : (value ?? 0) <= target;
              return (
                <li key={metric.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-small text-ink">{metric.label}</span>
                    <span className="font-mono text-small text-ink/70">
                      {formatValue(value, metric.unit, ctx.workspace.currency)} of{" "}
                      {formatValue(target, metric.unit, ctx.workspace.currency)}
                      <span className="ml-2 text-ink/50">{Math.round(share)}%</span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-3">
                    <div
                      aria-hidden
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--aos-cream-deep)" }}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, share))}%`,
                        background: good ? "var(--aos-navy)" : "var(--aos-orange)",
                        boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--aos-ink) 14%, transparent)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : ctx.canEdit ? (
        <Card className="mt-8">
          <SectionTitle>No targets set</SectionTitle>
          <p className="text-body text-ink/70">
            Targets give every figure something to be measured against, and put a
            progress bar here.{" "}
            <Link
              href={reportHref("/reporting/targets", ctx)}
              className="underline underline-offset-4"
            >
              Set them for this client
            </Link>
            .
          </p>
        </Card>
      ) : null}

      {ctx.canEdit && leadsCard ? <div className="mt-8">{leadsCard}</div> : null}

      <div
        className={`mt-8 grid gap-6 ${
          sidebar ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "max-w-3xl"
        }`}
      >
        <div className="flex flex-col gap-6">
          <StrategistNotes
            notes={overviewNotes}
            canWrite={ctx.canEdit && ctx.workspace.kind === "retainer"}
            workspaceId={ctx.workspace.id}
            month={ctx.month.month}
            category=""
            mine={mine}
            emptyMessage="Your strategist hasn't written this month's note yet."
          />

          {ctx.workspace.kind === "retainer" ? (
            <>
              <Objectives
                objectives={objectives}
                canWrite={ctx.canEdit}
                workspaceId={ctx.workspace.id}
                month={ctx.month.month}
              />
              <ClientReplies
                replies={replies}
                canReply={canReply}
                currentUserId={ctx.reportUser.id}
                workspaceId={ctx.workspace.id}
                month={ctx.month.month}
                monthLabel={ctx.month.label}
              />
            </>
          ) : null}
        </div>

        {sidebar ? (
          <div
            className={`flex flex-col gap-6 ${
              // Stacked on a phone, the client's chart would otherwise land
              // after "Anything you'd like to say?" — inviting a comment on
              // figures they have not been shown yet. It goes with the KPI
              // strip instead, and the written half follows. An editor's
              // column keeps its place: theirs is actions, not an exhibit.
              ctx.canEdit ? "" : "order-first lg:order-none"
            }`}
          >
            {sidebar}
          </div>
        ) : null}
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
