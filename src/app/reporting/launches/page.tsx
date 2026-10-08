import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LaunchCard } from "@/components/reporting/launch-card";
import { ReportShell } from "@/components/reporting/report-shell";
import { Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { launchSummary } from "@/lib/reporting/launch-figures";
import { getLaunch, getLaunches } from "@/lib/reporting/launch-queries";
import { lastDayOf } from "@/lib/reporting/months";

export const metadata: Metadata = {
  title: "Launches — aOS",
};

/**
 * Every launch, as cards (§6).
 *
 * **Not a month's screen.** A launch has its own dates and its own page,
 * so this one carries no month in its own right — it sits inside the
 * report shell so the tabs and the business picker are where they always
 * are, and the month picker goes on pointing at whatever month the rest
 * of the report is showing.
 *
 * Stage 4, so no route until the flag moves. The Launches TAB hides
 * itself, because `categoryBySlug` refuses a category ahead of the build;
 * this page is not a category and needs its own gate.
 */
export default async function LaunchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!STAGE_4) notFound();

  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  const launches = await getLaunches(ctx.workspace.id);

  // One round trip per launch for its figures. A launch holds a handful of
  // rows, and the alternative — one query returning every figure of every
  // launch — is a bag this page would then have to take apart again.
  const cards = await Promise.all(
    launches.map(async (launch) => {
      const detail = await getLaunch(launch.id);
      return detail
        ? { launch, summary: launchSummary(detail), stages: detail.stages }
        : null;
    }),
  );

  const stagesByLaunch = new Map(
    cards.filter((c) => c !== null).map((c) => [c.launch.id, c.stages]),
  );

  const shown = cards.filter((c): c is NonNullable<typeof c> => c !== null);

  // **Decision 14.** A launch is not a month, but the monthly report's
  // Launches tab should still say what happened in the month being read
  // — so the month's launches come first, under their own heading, and
  // everything else follows. One screen and one route: a second page
  // showing the same cards filtered differently would be two places for
  // a card to look wrong.
  //
  // "In this month" means its live dates touch it. A launch that ran
  // from late September into October belongs to both, which is the
  // honest answer and the reason this is an overlap rather than a match.
  const monthStart = ctx.month.month;
  const monthEnd = lastDayOf(monthStart);
  const liveIn = (launch: { id: string }) => {
    const stages = stagesByLaunch.get(launch.id) ?? [];
    return stages.some((stage) => {
      const from = stage.live_start ?? stage.live_end;
      const to = stage.live_end ?? stage.live_start;
      return from !== null && to !== null && from <= monthEnd && to >= monthStart;
    });
  };

  const thisMonth = shown.filter((c) => liveIn(c.launch));
  const others = shown.filter((c) => !liveIn(c.launch));

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path="/reporting/launches"
      title="Launches"
      tagline={`EVERY LAUNCH, END TO END · ${ctx.workspace.business_name}`}
      // §13: every clickable thing has exactly one route in, which is
      // why these appeared only once their pages did.
      actions={
        ctx.canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            {shown.length > 1 ? (
              <Link
                href={reportHref("/reporting/launches/compare", ctx)}
                className={buttonClasses("secondary", "sm")}
              >
                Compare launches
              </Link>
            ) : null}
            <Link
              href={reportHref("/reporting/launches/new", ctx)}
              className={buttonClasses("primary", "sm")}
            >
              + New launch
            </Link>
          </div>
        ) : null
      }
        >
      {shown.length === 0 ? (
        <Card>
          <SectionTitle>No launches yet</SectionTitle>
          <p className="text-body text-ink/70">
            {ctx.canEdit
              ? "A launch has its own dates and its own page, so it is not tied to a month. Start one when there is something to plan."
              : "There is nothing here yet. Your strategist will add a launch when one is running."}
          </p>
        </Card>
      ) : (
        <>
          {thisMonth.length > 0 ? (
            <section>
              <Eyebrow className="mb-3">Live in {ctx.month.label}</Eyebrow>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {thisMonth.map(({ launch, summary }) => (
                  <LaunchCard
                    key={launch.id}
                    launch={launch}
                    summary={summary}
                    goal={launch.goal_good}
                    href={reportHref(`/reporting/launches/${launch.id}`, ctx)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {others.length > 0 ? (
            <section className={thisMonth.length > 0 ? "mt-8" : undefined}>
              {thisMonth.length > 0 ? (
                <Eyebrow className="mb-3">Every other launch</Eyebrow>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {others.map(({ launch, summary }) => (
                  <LaunchCard
                    key={launch.id}
                    launch={launch}
                    summary={summary}
                    goal={launch.goal_good}
                    href={reportHref(`/reporting/launches/${launch.id}`, ctx)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </ReportShell>
  );
}
