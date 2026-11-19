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
import { GoalProgress } from "@/components/reporting/goal-progress";
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
import {
  adFigures,
  dayGrid,
  emailRows,
  launchSummary,
  pipelineFigures,
  plannerFigures,
  sourceFigures,
  sourceTotals,
  stageFigures,
} from "@/lib/reporting/launch-figures";
import { shortDate } from "@/lib/reporting/launch-dates";
import { launchIsRunning, launchLastDay } from "@/lib/reporting/locked";
import { formatCalendarDate } from "@/lib/time-zone";
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
  const sources = sourceFigures(detail);
  const sourceSum = sourceTotals(sources);
  const ads = adFigures(detail);
  const pipeline = pipelineFigures(detail);
  const planner = plannerFigures(detail);
  const days = dayGrid(detail);
  const emails = emailRows(detail);
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

  // **MRR only where a price option is monthly** (Nina's item 3). A
  // launch selling one thing once has no recurring revenue, and a card
  // reading "£0" would say something false about it — `mrr` is null
  // there rather than zero, and the card is absent rather than a dash
  // nobody can act on.
  if (summary.mrr !== null) {
    headline.push({
      label: "MRR from this launch",
      value: summary.mrr,
      unit: "currency",
      goodDirection: "up",
      icon: "revenue",
    });
  }

  // Seven cards break 4 + 3 rather than 3 + 3 + 1, which is the only
  // arrangement of seven that does not leave one card alone on a row.
  const headlineColumns = headline.length > 6 ? "xl:grid-cols-4" : "xl:grid-cols-3";

  /**
   * "Running totals, live until 12 October", on a launch still going.
   *
   * Nina updates a launch daily while it runs, so a published launch's
   * figures move — and a published report is read as final unless it
   * says otherwise. **This sentence is what buys that**: without it the
   * client reads Tuesday's numbers as the answer and the Friday figures
   * as a correction. Shown to everybody, team and client alike, because
   * the team needs to know which state a launch is in as much as the
   * client does.
   */
  const lastDay = launchLastDay(detail.stages);
  const running = launchIsRunning(ctx.workspace, detail.launch.published_at, lastDay);

  /**
   * Her item 4: the same three levels, asked of two figures.
   *
   * Sign-ups first, because they happen first and because a launch that
   * misses its sales goal usually misses it here — a reader who sees
   * only the sales row is left to guess whether the offer or the
   * audience was the problem.
   */
  const salesGoals = [
    { label: "Good" as const, target: detail.launch.goal_good },
    { label: "Better" as const, target: detail.launch.goal_better },
    { label: "Best" as const, target: detail.launch.goal_best },
  ];
  const signUpGoals = [
    { label: "Good" as const, target: detail.launch.sign_up_goal_good },
    { label: "Better" as const, target: detail.launch.sign_up_goal_better },
    { label: "Best" as const, target: detail.launch.sign_up_goal_best },
  ];
  const anyGoal = [...salesGoals, ...signUpGoals].some((g) => g.target !== null);

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path={`/reporting/launches/${id}`}
      title={detail.launch.name}
      tagline={`${detail.launch.description ?? "EVERY LAUNCH, END TO END"} · ${ctx.workspace.business_name}`}
      actions={
        ctx.canEdit || detail.launch.lead_tracker_url ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Her item 7: a button to their own sheet.
                **Shown to the client too**, because it is their list —
                aOS holds the link and the counts, and the names stay in
                their Drive. `rel="noopener noreferrer"` and a new tab
                because it leads out of the product, and the column is
                constrained to http(s) in the database so nothing
                script-shaped can reach this anchor. */}
            {detail.launch.lead_tracker_url ? (
              <a
                href={detail.launch.lead_tracker_url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("secondary", "sm")}
              >
                Your lead tracker
              </a>
            ) : null}
            {ctx.canEdit ? (
              <>
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
              </>
            ) : null}
          </div>
        ) : null
      }
    >
      {running && lastDay ? (
        <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-orange/30 bg-orange/10 px-4 py-3 text-small text-ink">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-orange"
          />
          <span className="font-medium">Running totals</span>
          <span className="text-ink/70">
            live until {formatCalendarDate(lastDay)}, so these figures are still moving
          </span>
        </p>
      ) : null}

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
      <div className={`grid gap-4 sm:grid-cols-2 ${headlineColumns}`}>
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

      {anyGoal ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionTitle
              icon={<IconCircle name="people" tone="sky" />}
              aside={`${summary.totalSignUps?.toLocaleString("en-GB") ?? "—"} signed up`}
            >
              Sign-up goals
            </SectionTitle>
            <GoalProgress now={summary.totalSignUps} levels={signUpGoals} noun="sign-ups" />
          </Card>
          <Card>
            <SectionTitle
              icon={<IconCircle name="target" tone="gold" />}
              aside={`${summary.totalSales ?? "—"} sold`}
            >
              Sales goals
            </SectionTitle>
            <GoalProgress now={summary.totalSales} levels={salesGoals} noun="sales" />
          </Card>
        </div>
      ) : null}

      <StageTimeline stages={detail.stages} className="mt-6" />

      {/* Her item 7: the climb. A running total rather than the daily
          counts, because the question a launch asks every morning is
          "how many now" and not "how many yesterday" — and the daily
          figures are noisy enough (a quiet Sunday, a spike the day an
          email went) to hide the trend they add up to.

          The last day with a figure carries its own number, which is the
          only point on this chart anybody quotes. */}
      {days.some((d) => d.signUps !== null) ? (
        <Card className="mt-6">
          <SectionTitle
            icon={<IconCircle name="chart" tone="orange" />}
            aside={`${days.at(-1)?.runningTotal?.toLocaleString("en-GB") ?? "—"} in total`}
          >
            Sign-ups as they came in
          </SectionTitle>
          <LineChart
            series={[
              {
                label: "Sign-ups to date",
                points: days.map((d) => d.runningTotal),
              },
            ]}
            unitSuffix=""
            caption={`Running total from ${shortDate(days[0].date)} to ${shortDate(
              days[days.length - 1].date,
            )}, one point a day.`}
            emptyMessage="No sign-ups counted by day yet."
          />
        </Card>
      ) : null}

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
      {(() => {
        /**
         * **Every funnel ends in "Bought"** (Nina, 3 November, through
         * Dom on the 4th: the challenge funnel itself should end there).
         *
         * It was the main selling stage and nothing else, because sales
         * are recorded by price option and by source and never by
         * stage: there is one total and no honest way to split it
         * between a challenge and the masterclass that followed it. The
         * worry was that the same number under two funnels reads as two
         * sets of sales.
         *
         * **The label carries that instead of the absence.** Under the
         * selling stage it is "Bought"; under any other stage it is
         * "Bought (whole launch)", which says in four words what
         * leaving it out was trying to say by silence — same sales,
         * counted once, shown here because this stage is part of how
         * they happened. A reader looking at a challenge funnel that
         * stopped at "stayed to the pitch" could not tell whether the
         * challenge sold nothing or whether nobody had said.
         *
         * Which stage is "the selling one": the flagged stage if there
         * is one, otherwise the last stage with a funnel, which is
         * where a launch that never said sells from.
         */
        const funnels = stages.filter(
          (s) => s.attendeesByDay.some((d) => d !== null) || s.liveAtEndOfPitch !== null,
        );
        const sellingStageId =
          funnels.find((s) => s.stage.is_main_selling_stage)?.stage.id ??
          funnels.at(-1)?.stage.id ??
          null;

        return funnels.map((s) => (
          <Card key={s.stage.id} className="mt-6">
            <SectionTitle
              icon={<IconCircle name="funnels" tone="blush" />}
              aside={s.showUpRate === null ? undefined : `${Math.round(s.showUpRate)}% showed up`}
            >
              {s.stage.name}: who turned up
            </SectionTitle>

            <FunnelChart
              stages={[
                { label: "Signed up", value: s.signUps, of: "of sign-ups" },
                // Day one, which is what "showed up" is measured against
                // everywhere else on this page.
                // **Short phrases, measured at 390px.** The row shares its
                // width with the funnel beside it, so "7% of those at the
                // pitch" ran into the figure on its left and truncated
                // "Bought" to "B" on a phone — which the assertions did
                // not catch, because every element was still technically
                // on the page. These fit with room to spare, and the row
                // above each one says the long version in full.
                {
                  label: "Attended live",
                  value: s.attendeesByDay[0] ?? null,
                  of: "of attendees",
                },
                {
                  label: "Stayed to the pitch",
                  value: s.liveAtEndOfPitch,
                  of: "of the pitch",
                },
                {
                  // **Only the main selling stage gets a "bought" step.**
                  // There is no per-stage sales figure in the schema —
                  // sales are recorded by price option and by source, not
                  // by stage — so the launch's own total belongs to the
                  // one stage §6.4 already measures conversion against.
                  // On any other stage the step is absent rather than
                  // guessed, and the funnel is three deep.
                  label:
                    s.stage.id === sellingStageId ? "Bought" : "Bought (whole launch)",
                  value: summary.totalSales,
                  // **Two shares, and the second is the card's own
                  // number** (Nina, 30 October). The funnel measures every
                  // step against the step above it, so "Bought" lands on
                  // sales ÷ those still in the room — while the
                  // Conversion rate card at the top of this page is sales
                  // ÷ sign-ups to the main selling stage, which Nina
                  // settled on 28 October. Both are true and they are
                  // different numbers, so a row showing only the first
                  // reads as the card being wrong.
                  //
                  // It is `conversionRate` rendered by the same formatter
                  // the card uses, not the same sum done twice: there is
                  // one value and one rounding, so the two cannot drift.
                  // **The second share is only ever the selling
                  // stage's.** `conversionRate` is sales ÷ sign-ups to
                  // the main selling stage (Nina, 28 October), so
                  // printing it beside a challenge's funnel would put
                  // the masterclass's denominator under the challenge's
                  // numbers.
                  also:
                    s.stage.id === sellingStageId && summary.conversionRate !== null
                      ? {
                          display: formatValue(summary.conversionRate, "percent"),
                          of: "of sign-ups",
                        }
                      : undefined,
                },
              ]}
              caption={
                s.stage.is_main_selling_stage
                  ? "Each step as a share of the step above it, and the last against sign-ups too — which is the conversion rate on the card above."
                  : "Each step as a share of the step above it."
              }
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
                <span className="font-num text-ink">
                  {s.liveAtEndOfPitch.toLocaleString("en-GB")}
                </span>{" "}
                still live at the end of the pitch
                {s.pitchRetention !== null && s.liveAtStart !== null ? (
                  <>
                    {" — "}
                    <span className="font-num text-ink">
                      {Math.round(s.pitchRetention)}%
                    </span>{" "}
                    of the{" "}
                    <span className="font-num text-ink">
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
        ));
      })()}

      <Card className="mt-6">
        <SectionTitle icon={<IconCircle name="email" tone="sky" />}>
          The email sequence
        </SectionTitle>
        {/* **Two charts, never one** (her item 9 asks for both rates,
            and the dataviz rule settles the shape). An open rate runs
            around 40% and a click rate around 4%: on one pair of axes
            the click line is a flat smudge along the bottom, and a
            second y-axis to fix that is the chart mistake this project
            does not make. Two charts, one scale each.

            Across the LAUNCH rather than per stage: her words, and the
            order emails went out in is not the stage order when a promo
            for stage three went before the last email of stage two. */}
        {emails.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <LineChart
              series={[{ label: "Open rate", points: emails.map((e) => e.openRate) }]}
              caption={`Open rate across ${emails.length} email${emails.length === 1 ? "" : "s"}, in the order they went.`}
              emptyMessage="No open rates yet. Two or more emails draw a line."
            />
            <LineChart
              series={[{ label: "Click rate", points: emails.map((e) => e.clickRate) }]}
              caption="Click rate across the same emails, on its own scale."
              emptyMessage="No click rates yet. Two or more emails draw a line."
            />
          </div>
        ) : (
          <LineChart
            // The old reading, kept for a launch whose emails were typed
            // before there was a row to describe them: the figures are
            // keyed by (stage, number) either way, so they still draw.
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
            emptyMessage="No email figures yet. Add the emails on the entry screen and they appear here."
          />
        )}

        {/* And the table, which is the half a chart cannot do: a subject
            line is the thing somebody wants to read next to the rate it
            got. */}
        {emails.length > 0 ? (
          <div className="mt-6 overflow-x-auto border-t border-ink/8 pt-5">
            <table className="w-full min-w-[34rem] border-collapse text-small">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <th className="pb-2 font-medium text-ink/55">Sent</th>
                  <th className="pb-2 font-medium text-ink/55">Subject</th>
                  <th className="pb-2 text-right font-medium text-ink/55">Sent to</th>
                  <th className="pb-2 text-right font-medium text-ink/55">Open</th>
                  <th className="pb-2 text-right font-medium text-ink/55">Click</th>
                  <th className="pb-2 text-right font-medium text-ink/55">Clicks</th>
                  <th className="pb-2 text-right font-medium text-ink/55">No sign-up</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((row) => (
                  <tr key={row.email.id} className="border-b border-ink/8 last:border-b-0">
                    <td className="py-2.5 pr-3 font-num text-ink/70 whitespace-nowrap">
                      {row.email.sent_on ? shortDate(row.email.sent_on) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-ink">
                      {row.email.subject ?? (
                        <span className="text-ink/45">Email {row.email.number}</span>
                      )}
                      {row.email.is_resend ? (
                        <span className="ml-2 rounded-full bg-cream-deep px-2 py-0.5 text-caption text-ink/70">
                          Resend
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-caption text-ink/45">
                        {row.stageName}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-num text-ink/70">
                      {row.sentTo?.toLocaleString("en-GB") ?? "—"}
                    </td>
                    <td className="py-2.5 text-right font-num text-ink">
                      {row.openRate === null ? "—" : `${row.openRate}%`}
                    </td>
                    <td className="py-2.5 text-right font-num text-ink">
                      {row.clickRate === null ? "—" : `${row.clickRate}%`}
                    </td>
                    <td className="py-2.5 text-right font-num text-ink/70">
                      {row.uniqueClicks?.toLocaleString("en-GB") ?? "—"}
                    </td>
                    <td className="py-2.5 text-right font-num text-ink/70">
                      {row.clickedNoSignUp?.toLocaleString("en-GB") ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-caption text-ink/50">
              &ldquo;No sign-up&rdquo; is how many clicked and did not sign up — the
              gap between the email working and the page working.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Her item 6: the client's own sources, what each was aiming for
          and what each did. The donut answers "where did they come
          from", the table answers "did it work" — and the second needs
          the target, which the six fixed metrics could never carry. */}
      {sources.length > 0 ? (
        <Card className="mt-6">
          <SectionTitle
            icon={<IconCircle name="leads" tone="orange" />}
            aside={`${sourceSum.signUps?.toLocaleString("en-GB") ?? "—"} placed`}
          >
            Where they came from
          </SectionTitle>

          {/* 22rem rather than 18: the donut's legend carries the
              client's OWN source names, which are as long as they chose
              to make them, and "Email list" came back as "E…" beside the
              table that spells it out. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
            <DonutChart
              // `colorIndex` is the source's place in the client's OWN
              // list, not in the drawn order — colour follows the thing,
              // never its rank, so a source that overtakes another
              // between months does not swap colours with it.
              slices={sources
                .map((row, i) => ({ row, colorIndex: i }))
                .filter(({ row }) => (row.signUps ?? 0) > 0)
                .map(({ row, colorIndex }) => ({
                  label: row.source.name,
                  value: row.signUps as number,
                  display: (row.signUps as number).toLocaleString("en-GB"),
                  colorIndex,
                }))}
              total={sourceSum.signUps}
              totalDisplay={sourceSum.signUps?.toLocaleString("en-GB") ?? "—"}
              totalLabel="sign-ups"
              emptyMessage="No sign-ups placed against a source yet."
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-small">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <th className="pb-2 font-medium text-ink/55">Source</th>
                    <th className="pb-2 text-right font-medium text-ink/55">Target</th>
                    <th className="pb-2 text-right font-medium text-ink/55">Sign-ups</th>
                    <th className="pb-2 text-right font-medium text-ink/55">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((row) => (
                    <tr key={row.source.id} className="border-b border-ink/8 last:border-b-0">
                      <td className="py-2.5 pr-3 text-ink">
                        {row.source.name}
                        {/* The share, and the bar that is the share. Both
                            on the row rather than in a second panel, so
                            a reader comparing two sources is not
                            comparing two places. */}
                        <span className="mt-1 block h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-cream-deep">
                          <span
                            className="block h-full rounded-full bg-orange"
                            style={{
                              width: `${Math.max(0, Math.min(row.percentOfTarget ?? row.shareOfSignUps ?? 0, 100))}%`,
                            }}
                          />
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-num text-ink/70">
                        {row.source.sign_up_target?.toLocaleString("en-GB") ?? "—"}
                      </td>
                      <td className="py-2.5 text-right font-num text-ink">
                        {row.signUps?.toLocaleString("en-GB") ?? "—"}
                        <span className="ml-2 text-ink/50">
                          {row.percentOfTarget === null
                            ? row.shareOfSignUps === null
                              ? ""
                              : `${Math.round(row.shareOfSignUps)}% of all`
                            : `${Math.round(row.percentOfTarget)}% of target`}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-num text-ink">
                        {row.sales?.toLocaleString("en-GB") ?? "—"}
                        {row.conversion === null ? null : (
                          <span className="ml-2 text-ink/50">
                            {Math.round(row.conversion * 10) / 10}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-ink/15">
                    <td className="pt-2.5 font-medium text-ink">Placed against a source</td>
                    <td className="pt-2.5 text-right font-num text-ink/70">
                      {sourceSum.target?.toLocaleString("en-GB") ?? "—"}
                    </td>
                    <td className="pt-2.5 text-right font-num text-ink">
                      {sourceSum.signUps?.toLocaleString("en-GB") ?? "—"}
                    </td>
                    <td className="pt-2.5 text-right font-num text-ink">
                      {sourceSum.sales?.toLocaleString("en-GB") ?? "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* A warning rather than a refusal, the same as §6.4's: a real
              launch has sales nobody can place, and the figure to doubt
              is the split rather than the total. */}
          {summary.totalSales !== null &&
          sourceSum.sales !== null &&
          sourceSum.sales !== summary.totalSales ? (
            <p className="mt-4 text-small text-ink/70">
              The sources account for {sourceSum.sales} of {summary.totalSales} sales.
              That is worth a look, though some launches genuinely have sales
              nobody can place.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Her item 8. Every figure in here was typed in before today and
          shown on no screen at all — the spend and the sign-ups from ads
          have been in the entry form since 30 September and reached only
          the team's Compare page. */}
      {ads.any ? (
        <Card className="mt-6">
          <SectionTitle
            icon={<IconCircle name="ads" tone="blush" />}
            aside={
              ads.left === null
                ? undefined
                : ads.left < 0
                  ? `${formatValue(Math.abs(ads.left), "currency", currency)} over`
                  : `${formatValue(ads.left, "currency", currency)} left`
            }
          >
            What the ads did
          </SectionTitle>
          <dl className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["Budget", ads.budget, "currency"],
                ["Spent", ads.spent, "currency"],
                ["Left", ads.left, "currency"],
                ["Target cost per sign-up", ads.targetCostPerSignUp, "currency"],
                ["Cost per sign-up", ads.costPerSignUp, "currency"],
                ["Cost per click", ads.costPerClick, "currency"],
              ] as const
            ).map(([label, value, unit]) => (
              <div key={label} className="rounded-xl bg-cream-deep px-4 py-3">
                <dt className="text-caption uppercase tracking-wide text-ink/55">{label}</dt>
                <dd className="font-num text-body text-ink">
                  {formatValue(value, unit, currency)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-body text-ink/80">
            <span className="font-num text-ink">
              {ads.signUps?.toLocaleString("en-GB") ?? "—"}
            </span>{" "}
            sign-ups from the ads
            {ads.signUpsNeeded === null ? (
              "."
            ) : (
              <>
                {", against "}
                <span className="font-num text-ink">
                  {ads.signUpsNeeded.toLocaleString("en-GB")}
                </span>{" "}
                the budget was meant to buy at that target.
              </>
            )}
            {ads.clicks === null ? null : (
              <>
                {" "}
                <span className="font-num text-ink">
                  {ads.clicks.toLocaleString("en-GB")}
                </span>{" "}
                link clicks.
              </>
            )}
          </p>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
                  <dd className="font-num text-body text-ink">{sold ?? "—"}</dd>
                </div>
              );
            })}
            {detail.prices.length === 0 ? (
              <p className="text-small text-ink/55">No price options set yet.</p>
            ) : null}
          </dl>
          {summary.mrr === null ? null : (
            <p className="mt-4 border-t border-ink/8 pt-3 text-small text-ink/70">
              <span className="font-num text-ink">
                {formatValue(summary.mrr, "currency", currency)}
              </span>{" "}
              of that is monthly, so it arrives again next month.
            </p>
          )}
        </Card>

        {/* The other half of §6.5, and the other block that has been
            typed in since September and shown nowhere. */}
        {pipeline.any ? (
          <Card>
            <SectionTitle icon={<IconCircle name="people" tone="sky" />}>
              DMs and calls
            </SectionTitle>
            <dl className="flex flex-col gap-3">
              {(
                [
                  ["DMs sent", pipeline.dmsSent, null],
                  ["Replies", pipeline.dmReplies, pipeline.replyRate],
                  ["Discovery calls", pipeline.discoveryCalls, null],
                  ["Sales calls booked", pipeline.callsBooked, null],
                  ["Closed on a call", pipeline.callsClosed, pipeline.callToCloseRate],
                  ["Not interested", pipeline.notInterested, null],
                ] as const
              ).map(([label, value, rate]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-small text-ink/70">{label}</dt>
                  <dd className="font-num text-body text-ink">
                    {value?.toLocaleString("en-GB") ?? "—"}
                    {rate === null ? null : (
                      <span className="ml-2 text-small text-ink/50">
                        {Math.round(rate)}%
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}
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

      {/* **Shown to the client as well now** (her item 5). It was the
          team's panel alone, on the reasoning that a client handed "you
          need 600 sign-ups" without the conversation is being handed a
          number rather than a plan. Her answer is the check underneath
          it: the plan is what the launch is being measured against, and
          a plan nobody can see is not one anybody is held to. */}
      <LaunchPlanner className="mt-6" figures={planner} canEdit={ctx.canEdit} />
    </ReportShell>
  );
}
