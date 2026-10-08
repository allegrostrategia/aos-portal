import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LaunchForm } from "@/components/reporting/launch-form";
import { PricesForm, StagesForm } from "@/components/reporting/stages-form";
import { LaunchLock } from "@/components/reporting/launch-publish";
import { ReportShell } from "@/components/reporting/report-shell";
import { buttonClasses } from "@/components/ui/button";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { getLaunch } from "@/lib/reporting/launch-queries";
import { launchIsLocked } from "@/lib/reporting/locked";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up a launch — aOS" };

/**
 * §6.1's setup: the launch, its stages and its price options.
 *
 * **Read-only once it is published**, the same as a month's entry screen
 * and for the same reason: the client has it. Status is the exception —
 * it describes the launch rather than the report (Nina's decision 15) —
 * and it sits outside the disabled fieldset, because a disabled fieldset
 * disables every descendant and `disabled={false}` on a child does not
 * undo it.
 */
export default async function EditLaunchPage({
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

  if (!ctx.canEdit) redirect(reportHref(`/reporting/launches/${id}`, ctx));

  const detail = await getLaunch(id);
  // Not found and not theirs are the same answer — §13.
  if (!detail || detail.launch.workspace_id !== ctx.workspace.id) notFound();

  const locked = launchIsLocked(ctx.workspace, detail.launch.published_at);

  const supabase = await createClient();
  const { data: offers } = await supabase
    .from("report_entities")
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .eq("entity_type", "offer")
    .eq("active", true)
    .order("name")
    .returns<{ id: string; name: string }[]>();

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path={`/reporting/launches/${id}/edit`}
      title={detail.launch.name}
      tagline={`SETTING IT UP · ${ctx.workspace.business_name}`}
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

      <LaunchForm
        workspaceId={ctx.workspace.id}
        launch={detail.launch}
        offers={offers ?? []}
        locked={locked}
      />
      <StagesForm launchId={id} stages={detail.stages} locked={locked} />
      <PricesForm launchId={id} prices={detail.prices} locked={locked} />
    </ReportShell>
  );
}
