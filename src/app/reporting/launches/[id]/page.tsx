import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BarChart } from "@/components/reporting/charts/bar-chart";
import { DonutChart } from "@/components/reporting/charts/donut-chart";
import { LineChart } from "@/components/reporting/charts/line-chart";
import { KpiCard } from "@/components/reporting/kpi-card";
import { LaunchPlanner } from "@/components/reporting/launch-planner";
import { ReportShell } from "@/components/reporting/report-shell";
import { StageTimeline } from "@/components/reporting/stage-timeline";
import { Card, SectionTitle } from "@/components/ui/card";
import { STAGE_4 } from "@/lib/reporting/categories";
import { resolveReportContext } from "@/lib/reporting/context";
import { formatValue } from "@/lib/reporting/format";
import { launchSummary, stageFigures } from "@/lib/reporting/launch-figures";
import { getLaunch } from "@/lib/reporting/launch-queries";

export const metadata: Metadata = {
  title: "Launch — aOS",
};

/**
 * One launch, end to end (§6).
 *
 * The most assembled screen in the product: six figures, three goals, a
 * timeline, a funnel per stage, the email sequence and the planner. Which
 * is why it gets the most browser coverage — three of the last four stages
 * had a bug here that no other layer could see.
 */
export default async function LaunchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!STAGE_4) notFound();

  const { id } = await params;
  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  const detail = await getLaunch(id);
  // Not found and not theirs are the same answer, deliberately — §13 says
  // never confirm that another client's record exists.
  if (!detail || detail.launch.workspace_id !== ctx.workspace.id) notFound();

  const summary = launchSummary(detail);
  const stages = stageFigures(detail);
  const currency = ctx.workspace.currency;

  // The longest email sequence any stage has, so the chart is as wide as
  // the launch rather than as wide as the loop that looks for it.
  const MAX_EMAILS = 20;
  const emailsInSequence = Math.max(
    0,
    ...detail.stages.flatMap((stage) =>
      Array.from({ length: MAX_EMAILS }, (_u, i) =>
        detail.values.get("launches_email_open_rate", { stageId: stage.id, email: i + 1 }) === null
          ? 0
          : i + 1,
      ),
    ),
  );

  const goals = [
    { label: "Good", target: detail.launch.goal_good, percent: summary.percentOfGood },
    { label: "Better", target: detail.launch.goal_better, percent: summary.percentOfBetter },
    { label: "Best", target: detail.launch.goal_best, percent: summary.percentOfBest },
  ].filter((g) => g.target !== null);

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path={`/reporting/launches/${id}`}
      title={detail.launch.name}
      tagline={`${detail.launch.description ?? "EVERY LAUNCH, END TO END"} · ${ctx.workspace.business_name}`}
    >
      {/* §6.4's headline figures. No month to compare against — a launch
          is not a month and has no previous one — so every card says so
          rather than inventing an arrow. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Total sales"
          value={summary.totalSales}
          previous={null}
          unit="count"
          goodDirection="up"
          currency={currency}
          previousLabel={null}
        />
        <KpiCard
          label="Total revenue"
          value={summary.totalRevenue}
          previous={null}
          unit="currency"
          goodDirection="up"
          currency={currency}
          previousLabel={null}
        />
        <KpiCard
          label="Still to collect"
          value={summary.revenueStillToCollect}
          previous={null}
          unit="currency"
          goodDirection="down"
          currency={currency}
          previousLabel={null}
        />
        <KpiCard
          label="Average order value"
          value={summary.averageOrderValue}
          previous={null}
          unit="currency"
          goodDirection="up"
          currency={currency}
          previousLabel={null}
        />
        <KpiCard
          label="Conversion rate"
          value={summary.conversionRate}
          previous={null}
          unit="percent"
          goodDirection="up"
          currency={currency}
          previousLabel={null}
        />
        <KpiCard
          label="Cash collected"
          value={summary.cashCollected}
          previous={null}
          unit="currency"
          goodDirection="up"
          currency={currency}
          previousLabel={null}
        />
      </div>

      {goals.length > 0 ? (
        <Card className="mt-6">
          <SectionTitle aside={`${summary.totalSales ?? "—"} sold`}>
            Good, better, best
          </SectionTitle>
          <ul className="flex flex-col gap-4">
            {goals.map((goal) => (
              <li key={goal.label}>
                <div className="flex items-baseline justify-between gap-3 text-small">
                  <span className="font-medium text-ink">{goal.label}</span>
                  <span className="font-mono text-ink/70">
                    {summary.totalSales ?? "—"} of {goal.target}
                    {goal.percent === null ? null : (
                      <span className="ml-2 text-ink/50">{Math.round(goal.percent)}%</span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-cream-deep">
                  <div
                    className="h-full rounded-full bg-orange"
                    style={{ width: `${Math.max(0, Math.min(goal.percent ?? 0, 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <StageTimeline stages={detail.stages} className="mt-6" />

      {/* §6.2's attendance, one chart per stage with live days. Horizontal
          bars, because the thing being read is the drop from day one. */}
      {stages
        .filter((s) => s.attendeesByDay.some((d) => d !== null))
        .map((s) => (
          <Card key={s.stage.id} className="mt-6">
            <SectionTitle
              aside={s.showUpRate === null ? undefined : `${Math.round(s.showUpRate)}% showed up`}
            >
              {s.stage.name}: who turned up
            </SectionTitle>
            <BarChart
              data={s.attendeesByDay.map((value, i) => ({
                label: `Day ${i + 1}`,
                value,
                display: value === null ? "—" : value.toLocaleString("en-GB"),
                missingNote: "Not entered",
              }))}
              caption={
                s.signUps === null
                  ? "Live attendees each day."
                  : `Live attendees each day, from ${s.signUps.toLocaleString("en-GB")} sign-ups.`
              }
            />
          </Card>
        ))}

      <Card className="mt-6">
        <SectionTitle>The email sequence</SectionTitle>
        <LineChart
          // As many points as there are emails, not a fixed twenty. The
          // first build drew an axis running 1 to 20 under a line that
          // stopped at 3, which says the sequence petered out rather
          // than that it was three emails long.
          series={stages.map((s) => ({
            label: s.stage.name,
            points: Array.from({ length: emailsInSequence }, (_u, i) =>
              detail.values.get("launches_email_open_rate", {
                stageId: s.stage.id,
                email: i + 1,
              }),
            ),
          }))}
          caption="Open rate across the sequence, one line per stage."
          emptyMessage="No email figures yet. Two or more emails in a stage draw a line."
        />
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Where the sales came from</SectionTitle>
          <DonutChart
            // `colorIndex` is the source's place in the FIXED list, not
            // in the drawn order — colour follows the thing, never its
            // rank, so a source that overtakes another between launches
            // does not swap colours with it.
            slices={summary.salesBySource
              .map((s, i) => ({ ...s, colorIndex: i }))
              .filter((s) => (s.value ?? 0) > 0)
              .map((s) => ({
                label: s.label,
                value: s.value as number,
                display: String(s.value),
                colorIndex: s.colorIndex,
              }))}
            total={summary.totalSales}
            totalDisplay={String(summary.totalSales ?? "—")}
            totalLabel="sales"
            emptyMessage="No sales recorded by source yet."
          />
          {/* §6.4: the sources must add up, and the screen says so when
              they do not — a warning rather than a refusal, because a real
              launch has sales nobody can attribute. */}
          {summary.totalSales !== null && !summary.sourcesAddUp ? (
            <p className="mt-3 text-small text-ink/70">
              The sources do not add up to {summary.totalSales} sales. That is
              worth a look, though some launches genuinely have sales nobody
              can place.
            </p>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>What each price option sold</SectionTitle>
          <dl className="flex flex-col gap-3">
            {detail.prices.map((price) => {
              const sold = detail.values.get("launches_sales_per_price_option", {
                priceId: price.id,
              });
              return (
                <div key={price.id} className="flex items-baseline justify-between gap-3">
                  <dt className="text-small text-ink/70">
                    {price.name}
                    <span className="ml-2 text-ink/45">
                      {formatValue(price.price, "currency", currency)}
                      {price.instalments
                        ? ` · ${price.instalments} × ${formatValue(price.instalment_amount, "currency", currency)}`
                        : null}
                    </span>
                  </dt>
                  <dd className="font-mono text-body text-ink">{sold ?? "—"}</dd>
                </div>
              );
            })}
            {detail.prices.length === 0 ? (
              <p className="text-small text-ink/55">No price options set yet.</p>
            ) : null}
          </dl>
        </Card>
      </div>

      {ctx.canEdit ? (
        <LaunchPlanner
          className="mt-6"
          showUpRate={detail.launch.planner_show_up_rate}
          conversionRate={detail.launch.planner_conversion_rate}
          goal={detail.launch.goal_good}
        />
      ) : null}
    </ReportShell>
  );
}
