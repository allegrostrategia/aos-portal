import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LaunchCard } from "@/components/reporting/launch-card";
import { ReportShell } from "@/components/reporting/report-shell";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { launchSummary } from "@/lib/reporting/launch-figures";
import { getLaunch, getLaunches } from "@/lib/reporting/launch-queries";

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
      return detail ? { launch, summary: launchSummary(detail) } : null;
    }),
  );

  const shown = cards.filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path="/reporting/launches"
      title="Launches"
      tagline={`EVERY LAUNCH, END TO END · ${ctx.workspace.business_name}`}
      // §13: every clickable thing has exactly one route in. "Compare
      // launches" is still absent because its page is — a button that
      // 404s is worse than no button.
      actions={
        ctx.canEdit ? (
          <Link
            href={reportHref("/reporting/launches/new", ctx)}
            className={buttonClasses("primary", "sm")}
          >
            + New launch
          </Link>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ launch, summary }) => (
            <LaunchCard
              key={launch.id}
              launch={launch}
              summary={summary}
              goal={launch.goal_good}
              href={reportHref(`/reporting/launches/${launch.id}`, ctx)}
            />
          ))}
        </div>
      )}
    </ReportShell>
  );
}
