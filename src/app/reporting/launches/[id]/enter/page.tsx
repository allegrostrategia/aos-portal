import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LaunchEntryForm } from "@/components/reporting/launch-entry-form";
import { LaunchLock } from "@/components/reporting/launch-publish";
import { ReportShell } from "@/components/reporting/report-shell";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { getLaunch } from "@/lib/reporting/launch-queries";
import { launchIsLocked } from "@/lib/reporting/locked";

export const metadata: Metadata = { title: "Enter a launch's figures — aOS" };

/**
 * §6.2 to §6.5: typing a launch's figures in.
 *
 * Read-only once published, the same as a month's entry screen — the
 * client has it, so a correction goes unpublish → fix → republish.
 */
export default async function EnterLaunchPage({
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

  // §2: a retainer client has no entry screen at all.
  if (!ctx.canEdit) redirect(reportHref(`/reporting/launches/${id}`, ctx));

  const detail = await getLaunch(id);
  if (!detail || detail.launch.workspace_id !== ctx.workspace.id) notFound();

  const locked = launchIsLocked(ctx.workspace, detail.launch.published_at);

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path={`/reporting/launches/${id}/enter`}
      title="Enter the figures"
      tagline={`${detail.launch.name} · ${ctx.workspace.business_name}`}
      actions={
        <Link
          href={reportHref(`/reporting/launches/${id}`, ctx)}
          className={buttonClasses("secondary", "sm")}
        >
          See the report
        </Link>
      }
    >
      {locked ? (
        <LaunchLock
          launchId={id}
          name={detail.launch.name}
          canUnpublish={ctx.canPublish}
        />
      ) : null}

      {detail.stages.length === 0 ? (
        <Card className="mb-6">
          <SectionTitle>No stages yet</SectionTitle>
          <p className="text-body text-ink/70">
            Sign-ups, attendance and emails all belong to a stage, so there is
            nowhere to put them until this launch has one.{" "}
            <Link
              href={reportHref(`/reporting/launches/${id}/edit`, ctx)}
              className="underline underline-offset-4"
            >
              Set its stages up
            </Link>
            , and they appear here.
          </p>
        </Card>
      ) : null}

      <LaunchEntryForm
        launch={detail.launch}
        stages={detail.stages}
        prices={detail.prices}
        values={detail.values.fields()}
        locked={locked}
        currency={ctx.workspace.currency}
      />
    </ReportShell>
  );
}
