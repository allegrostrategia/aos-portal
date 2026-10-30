import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BarChart } from "@/components/reporting/charts/bar-chart";
import { DonutChart } from "@/components/reporting/charts/donut-chart";
import { FunnelChart } from "@/components/reporting/charts/funnel-chart";
import { LineChart } from "@/components/reporting/charts/line-chart";
import {
  IconCircle,
  type ReportIconName,
  toneFor,
} from "@/components/reporting/icons";
import { KpiCard } from "@/components/reporting/kpi-card";
import { LaunchPlanner } from "@/components/reporting/launch-planner";
import { LaunchPublishControl } from "@/components/reporting/launch-publish";
import { ReportShell } from "@/components/reporting/report-shell";
import { StageTimeline } from "@/components/reporting/stage-timeline";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { formatValue } from "@/lib/reporting/format";
import { launchSummary, stageFigures } from "@/lib/reporting/launch-figures";
import { signLaunchCover } from "@/lib/reporting/launch-cover";
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
  const coverUrl = await signLaunchCover(detail.launch.cover_image_path);

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

  /**
   * The six headline cards, and the glyph on each.
   *
   * Six distinct glyphs rather than six launches. The rule is the one
   * `metric-icons.ts` sets out for every other row in the report:
   * decoration that repeats its own label is better than decoration that
   * repeats its neighbour, and a row of six identical rockets would be the
   * duller reading of the same cards.
   */
  const headline: {
    label: string;
    value: number | null;
    unit: "count" | "currency" | "percent";
    goodDirection: "up" | "down";
    icon: ReportIconName;
  }[] = [
    { label: "Total sales", value: summary.totalSales, unit: "count", goodDirection: "up", icon: "star" },
    { label: "Total revenue", value: summary.totalRevenue, unit: "currency", goodDirection: "up", icon: "revenue" },
    { label: "Still to collect", value: summary.revenueStillToCollect, unit: "currency", goodDirection: "down", icon: "clock" },
    { label: "Average order value", value: summary.averageOrderValue, unit: "currency", goodDirection: "up", icon: "calculator" },
    { label: "Conversion rate", value: summary.conversionRate, unit: "percent", goodDirection: "up", icon: "target" },
    { label: "Cash collected", value: summary.cashCollected, unit: "currency", goodDirection: "up", icon: "profit" },
  ];

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
      actions={
        ctx.canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={reportHref(`/reporting/launches/${id}/edit`, ctx)}
              className={buttonClasses("secondary", "sm")}
            >
              Edit launch details
            </Link>
            <Link
              href={reportHref(`/reporting/launches/${id}/enter`, ctx)}
              className={buttonClasses("primary", "sm")}
            >
              Enter data
            </Link>
          </div>
        ) : null
      }
    >
      {/* The cover, where there is one (Nina's decision 12 — optional).
          Signed through the reader's own session, so a client only ever
          gets a link to a launch they can already see. */}
      {coverUrl ? (
        <div className="relative mb-6 aspect-[3/1] w-full overflow-hidden rounded-card bg-cream-deep">
          <Image
            src={coverUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 1024px"
            className="object-cover"
            priority
            unoptimized
          />
        </div>
      ) : null}

      {/* §6.4's headline figures. No month to compare against — a launch
          is not a month and has no previous one — so every card says so
          rather than inventing an arrow.

          A list rather than six hand-written cards, so the discs rotate
          through the four tones the way `/reporting` and every category
          page do theirs, rather than this one screen picking its own. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {headline.map((card, index) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            previous={null}
            unit={card.unit}
            goodDirection={card.goodDirection}
            currency={currency}
            previousLabel={null}
            icon={{ name: card.icon, tone: toneFor(index) }}
          />
        ))}
      </div>

      {goals.length > 0 ? (
        <Card className="mt-6">
          <SectionTitle
            icon={<IconCircle name="target" tone="gold" />}
            aside={`${summary.totalSales ?? "—"} sold`}
          >
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

      {/* §6.2's attendance, one panel per stage with live days.

          **The funnel is the panel's graphic now** (Nina, 30 October,
          against the approved mockup): signed up → attended live → still
          there at the end of the pitch → bought, each stage a share of the
          one above it. That is what a funnel is for and what four bars
          could not say — every step here is a subset of the step before.

          The day-by-day bars stay underneath where a stage ran for more
          than one day, because they answer a different question: not how
          many were lost, but which day lost them. A one-day stage has
          nothing for them to show that the funnel's second step has not
          already said, so it does not get them. */}
      {stages
        .filter(
          (s) => s.attendeesByDay.some((d) => d !== null) || s.liveAtEndOfPitch !== null,
        )
        .map((s) => (
          <Card key={s.stage.id} className="mt-6">
            <SectionTitle
              icon={<IconCircle name="funnels" tone="blush" />}
              aside={s.showUpRate === null ? undefined : `${Math.round(s.showUpRate)}% showed up`}
            >
              {s.stage.name}: who turned up
            </SectionTitle>

            <FunnelChart
              stages={[
                { label: "Signed up", value: s.signUps },
                // Day one, which is what "showed up" is measured against
                // everywhere else on this page.
                { label: "Attended live", value: s.attendeesByDay[0] ?? null },
                { label: "Stayed to the pitch", value: s.liveAtEndOfPitch },
                {
                  // **Only the main selling stage gets a "bought" step.**
                  // There is no per-stage sales figure in the schema —
                  // sales are recorded by price option and by source, not
                  // by stage — so the launch's own total belongs to the
                  // one stage §6.4 already measures conversion against.
                  // On any other stage the step is absent rather than
                  // guessed, and the funnel is three deep.
                  label: "Bought",
                  value: s.stage.is_main_selling_stage ? summary.totalSales : null,
                },
              ]}
              caption="Each step as a share of the step above it."
            />

            {s.attendeesByDay.length > 1 && s.attendeesByDay.some((d) => d !== null) ? (
              <div className="mt-6 border-t border-ink/8 pt-5">
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
              </div>
            ) : null}

            {/* Decision 19, as Nina asked for it on 28 October: the count
                that is still in the room, and that as a share of the room
                at the start of the session. The count comes first because
                it is the one somebody can picture. */}
            {s.liveAtEndOfPitch !== null ? (
              <p className="mt-4 rounded-xl bg-cream-deep px-4 py-3 text-body text-ink/80">
                <span className="font-mono text-ink">
                  {s.liveAtEndOfPitch.toLocaleString("en-GB")}
                </span>{" "}
                still live at the end of the pitch
                {s.pitchRetention !== null && s.liveAtStart !== null ? (
                  <>
                    {" — "}
                    <span className="font-mono text-ink">
                      {Math.round(s.pitchRetention)}%
                    </span>{" "}
                    of the{" "}
                    <span className="font-mono text-ink">
                      {s.liveAtStart.toLocaleString("en-GB")}
                    </span>{" "}
                    there at the start of the session.
                  </>
                ) : (
                  <>
                    {". "}
                    <span className="text-ink/55">
                      Enter &ldquo;live at start&rdquo; to see that as a share.
                    </span>
                  </>
                )}
              </p>
            ) : null}
          </Card>
        ))}

      <Card className="mt-6">
        <SectionTitle icon={<IconCircle name="email" tone="sky" />}>
          The email sequence
        </SectionTitle>
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
          <SectionTitle icon={<IconCircle name="leads" tone="orange" />}>
            Where the sales came from
          </SectionTitle>
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
          <SectionTitle icon={<IconCircle name="offers" tone="gold" />}>
            What each price option sold
          </SectionTitle>
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

      {ctx.canPublish && ctx.workspace.kind === "retainer" ? (
        <LaunchPublishControl
          launchId={id}
          name={detail.launch.name}
          publishedAt={detail.launch.published_at}
          canEmailClient={ctx.workspace.kind === "retainer"}
          updateEmailSentAt={detail.launch.update_email_sent_at}
        />
      ) : null}

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
