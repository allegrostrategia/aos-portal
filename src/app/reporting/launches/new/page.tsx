import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LaunchForm } from "@/components/reporting/launch-form";
import { ReportShell } from "@/components/reporting/report-shell";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New launch — aOS" };

/**
 * Starting a launch (§6.1).
 *
 * Name and goals here; stages and price options on the next screen, which
 * this redirects to once the record exists. Two screens rather than one
 * because a stage needs a launch to belong to, and a form that pretends
 * otherwise has to invent an order to save things in.
 */
export default async function NewLaunchPage({
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

  // §2: a retainer client views and comments. Sent to the list rather
  // than shown a refusal — explaining a screen that is not theirs to
  // think about is worse than not showing it.
  if (!ctx.canEdit) redirect(reportHref("/reporting/launches", ctx));

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
      path="/reporting/launches/new"
      title="A new launch"
      tagline={`EVERY LAUNCH, END TO END · ${ctx.workspace.business_name}`}
    >
      <LaunchForm
        workspaceId={ctx.workspace.id}
        launch={null}
        offers={offers ?? []}
        locked={false}
        returnTo=""
      />
    </ReportShell>
  );
}
