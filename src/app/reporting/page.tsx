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
import { monthIsLocked } from "@/lib/reporting/locked";
import { unpublishWarning } from "@/lib/reporting/unpublish-warning";
import { publishWarning } from "@/lib/reporting/publish-warning";
import { draftMonthsBefore } from "@/lib/reporting/carried-build";
import { getPublishedMonths } from "@/lib/reporting/queries";
import { PANELS, highlights } from "@/lib/reporting/highlights";
import { buttonClasses } from "@/components/ui/button";
import { formatValue } from "@/lib/reporting/format";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { ENTRY_CATEGORIES, STAGE_3, categoryByKey } from "@/lib/reporting/categories";
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
  // On a published month, the month it was compared against comes from
  // the snapshot too. `ctx.month.previous` is the previous month the
  // VIEWER can see, and a client sees published ones only — so without
  // this, unpublishing July turns "vs. July" into "No month to compare"
  // on an August that still holds July's figures.
  const comparedWith = figures.carried?.previousMonth ?? ctx.month.previous;
  const previousLabel = comparedWith ? monthLabel(comparedWith).split(" ")[0] : null;

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

  // A published month is read-only for everyone (Dom, 7 Oct 2026), so the
  // note and the objectives render as the client reads them. `canWrite` is
  // the switch those components already have for "removed, not hidden" —
  // §13's rule — which is why the lock reuses it rather than greying out a
  // textarea the client's own view never had.
  const locked = monthIsLocked(ctx.workspace, period?.published_at);
  // A member reporting on themselves is not "this client" — there is
  // nobody else in the conversation (Dom, 9 Oct).
  const selfServe = ctx.workspace.kind !== "retainer";

  // What taking this month back to draft would do to the months after it.
  // Only worth asking where somebody can actually do it; a client's page
  // should not spend a query on a button they will never see.
  const laterPublished = ctx.canPublish
    ? (await getPublishedMonths(ctx.workspace.id)).filter((m) => m > ctx.month.month)
    : [];
  const takingItBackWarning = unpublishWarning(
    laterPublished,
    figures.data.values.size > 0,
  );

  // Only worth asking before a month goes out, and only of the person who
  // can send it. An earlier draft would be frozen into this month's
  // snapshot, and finishing it afterwards would not undo that.
  const outOfOrderWarning =
    ctx.canPublish && !period?.published_at
      ? publishWarning(
          await draftMonthsBefore(ctx.workspace.id, ctx.month.month),
          ctx.month.month,
        )
      : null;

  // §7's bar: up to five targets, in the metric list's own order so the
  // same five stay in the same places month to month.
  // On a published month these come from the snapshot too (decision 2):
  // "New clients is at 40% of your target" is a sentence in the client's
  // own report, and a standing target or a benchmark belongs to no month,
  // so the published-month lock cannot reach either. This is what closes
  // those two holes.
  const [liveTargets, liveBenchmarks] = await Promise.all([
    getTargets(ctx.workspace.id, ctx.month.month),
    getBenchmarks(ctx.workspace.id),
  ]);
  const targets = figures.carried
    ? new Map(Object.entries(figures.carried.targets))
    : liveTargets;
  const benchmarks = figures.carried
    ? new Map(Object.entries(figures.carried.benchmarks))
    : liveBenchmarks;
  // §7's two panels. Every word in them is Nina's, from one file.
  const panels = highlights(
    figures.metrics
      .filter((metric) => metric.entity_type === null && metric.good_direction !== "none")
      .filter((metric) => !ctx.workspace.hidden_categories.includes(metric.category))
      .map((metric) => ({
        key: metric.key,
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
          unpublishWarning={takingItBackWarning}
          publishWarning={outOfOrderWarning}
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
                light={STAGE_3 ? lightFor({
                  value: figures.figure(kpi.metricKey),
                  target: targets.get(`${kpi.metricKey}|`),
                  benchmark: benchmarks.get(kpi.metricKey),
                  lastMonth: figures.previousFigure(kpi.metricKey),
                  goodDirection: metric.good_direction,
                }) : null}
              />
            );
          })}
        </div>
      </section>

      {STAGE_3 && (panels.attention.length > 0 || panels.wins.length > 0) ? (
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

      {STAGE_3 && targetRows.length > 0 ? (
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
      ) : STAGE_3 && ctx.canEdit ? (
        <Card className="mt-8">
          <SectionTitle>No targets set</SectionTitle>
          <p className="text-body text-ink/70">
            Targets give every figure something to be measured against, and put a
            progress bar here.{" "}
            <Link
              href={reportHref("/reporting/targets", ctx)}
              className="underline underline-offset-4"
            >
              {selfServe ? "Set yours" : "Set them for this client"}
            </Link>
            .
          </p>
        </Card>
      ) : null}

      {/* §8.1's way to turn a section off, and §10.3's setup answers.
          Only for somebody who is their own editor — a retainer client
          has neither, and Allegro reaches a client's settings from the
          admin screen instead. */}
      {ctx.canEdit && selfServe ? (
        <p className="mt-6 text-small text-ink/60">
          <Link
            href={reportHref("/reporting/settings", ctx)}
            className="underline underline-offset-4"
          >
            Your report settings
          </Link>{" "}
          — the business, your hourly rate, and which sections you use.
        </p>
      ) : null}

      {ctx.canEdit && leadsCard ? <div className="mt-8">{leadsCard}</div> : null}

      <div
        className={`mt-8 grid gap-6 ${
          sidebar ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "max-w-3xl"
        }`}
      >
        <div className="flex flex-col gap-6">
          {/* **Not on a self-serve report at all** (Dom, 9 Oct). A
              member has no strategist: the card said "Your strategist
              hasn't written this month's note yet" to somebody who was
              never going to get one, which reads as a thing that is
              late rather than a thing that does not exist. Their own
              reflection is the equivalent, and it is theirs to write. */}
          {ctx.workspace.kind === "retainer" ? (
            <StrategistNotes
              notes={overviewNotes}
              canWrite={ctx.canEdit && !locked}
              workspaceId={ctx.workspace.id}
              month={ctx.month.month}
              category=""
              mine={mine}
              emptyMessage="Your strategist hasn't written this month's note yet."
            />
          ) : null}

          {ctx.workspace.kind === "retainer" ? (
            <>
              <Objectives
                objectives={objectives}
                canWrite={ctx.canEdit && !locked}
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

  // A section with nothing to fill in is finished, not excluded. Counted
  // the old way, a member with no funnels and no ads could never reach
  // "9 of 9" however much they typed.
  const isDone = (r: { filled: number; total: number }) =>
    r.total === 0 || r.filled === r.total;
  const done = rows.filter(isDone).length;

  return (
    <Card>
      <SectionTitle aside={`${done} of ${rows.length} done`}>
        Still to fill in
      </SectionTitle>
      <ul className="flex flex-col gap-1">
        {rows.map(({ category, filled, total }) => {
          const complete = isDone({ filled, total });
          return (
            <li
              key={category.key}
              data-completion={category.key}
              data-filled={filled}
              data-total={total}
            >
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
