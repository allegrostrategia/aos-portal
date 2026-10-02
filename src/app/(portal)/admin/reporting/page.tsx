import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { monthLabel } from "@/lib/reporting/months";
import { NewClientForm, AssignTeamForm, EditWorkspaceForm } from "./forms";

export const metadata: Metadata = {
  title: "Reporting clients · aOS admin",
};

interface WorkspaceRow {
  id: string;
  kind: "retainer" | "aos_member" | "chiarezza";
  business_name: string;
  currency: string;
  first_month: string;
  access_end_date: string | null;
}

const KIND_LABEL = {
  retainer: "Retainer",
  aos_member: "aOS member",
  chiarezza: "Chiarezza",
} as const;

/**
 * Setting up who the reporting tool reports on.
 *
 * Nina only. Elize reaches her clients through the reporting tool's own
 * business picker and has no business here — and could not open it anyway,
 * since `(portal)` requires a `members` row and she has none by design.
 *
 * This is the screen Stage 2 cannot be finished without: its "done when" is
 * a real retainer client with two months entered, and there was no way to
 * create one.
 */
export default async function AdminReportingPage() {
  await requireAdmin();

  const supabase = await createClient();

  // RLS returns every workspace because is_portal_admin() is true.
  const [{ data: workspaces }, { data: grants }, { data: periods }] = await Promise.all([
    supabase
      .from("report_workspaces")
      .select("id, kind, business_name, currency, first_month, access_end_date")
      .order("business_name")
      .returns<WorkspaceRow[]>(),
    supabase
      .from("report_access")
      .select("workspace_id, user_id, role, display_name")
      .returns<
        { workspace_id: string; user_id: string; role: "client" | "team"; display_name: string }[]
      >(),
    supabase
      .from("report_periods")
      .select("workspace_id, month, published_at")
      .order("month", { ascending: false })
      .returns<{ workspace_id: string; month: string; published_at: string | null }[]>(),
  ]);

  const rows = workspaces ?? [];
  const byWorkspace = new Map(rows.map((w) => [w.id, { client: "", team: [] as string[] }]));
  for (const grant of grants ?? []) {
    const entry = byWorkspace.get(grant.workspace_id);
    if (!entry) continue;
    if (grant.role === "client") entry.client = grant.display_name;
    else entry.team.push(grant.display_name);
  }

  const monthsFor = new Map<string, { month: string; published_at: string | null }[]>();
  for (const period of periods ?? []) {
    const list = monthsFor.get(period.workspace_id) ?? [];
    list.push(period);
    monthsFor.set(period.workspace_id, list);
  }

  return (
    <>
      <PageHeader
        title="Reporting clients"
        tagline="WHO THE TOOL REPORTS ON"
        intro="Each client gets a login that shows their report and nothing else. Creating one sends the invitation and sets up their workspace in the same step."
      />

      <div className="flex flex-col gap-6">
        {rows.length === 0 ? (
          <Card>
            <SectionTitle>No clients set up yet</SectionTitle>
            <p className="text-body text-ink/70">
              Add the first one below. You will need their email address, the
              name of their business, and the first month you have figures for.
            </p>
          </Card>
        ) : null}

        {rows.map((workspace) => {
          const people = byWorkspace.get(workspace.id);
          const months = monthsFor.get(workspace.id) ?? [];
          const published = months.filter((m) => m.published_at).length;

          return (
            <Card key={workspace.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-display text-heading font-medium text-ink">
                    {workspace.business_name}
                  </h2>
                  <p className="mt-1 text-small text-ink/60">
                    {people?.client ? `${people.client} · ` : null}
                    from {monthLabel(workspace.first_month)}
                    {workspace.access_end_date
                      ? ` · access ends ${workspace.access_end_date}`
                      : null}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={workspace.kind === "retainer" ? "gold" : "neutral"}>
                    {KIND_LABEL[workspace.kind]}
                  </Badge>
                  <Link
                    href={`/reporting?workspace=${workspace.id}`}
                    className={buttonClasses("secondary", "sm")}
                  >
                    Open report
                  </Link>
                </div>
              </div>

              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-ink/8 pt-4">
                <div>
                  <dt className="text-caption text-ink/55">Months started</dt>
                  <dd className="font-mono text-body text-ink">{months.length}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink/55">Published</dt>
                  <dd className="font-mono text-body text-ink">{published}</dd>
                </div>
                <div className="min-w-40">
                  <dt className="text-caption text-ink/55">Team</dt>
                  <dd className="text-body text-ink">
                    {people && people.team.length > 0
                      ? people.team.join(", ")
                      : "Nobody assigned"}
                  </dd>
                </div>
              </dl>

              <details className="group mt-4 border-t border-ink/8 pt-3">
                <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4 transition hover:text-ink">
                  Edit details
                </summary>
                <div className="mt-3">
                  <EditWorkspaceForm
                    workspaceId={workspace.id}
                    businessName={workspace.business_name}
                    currency={workspace.currency}
                    firstMonth={workspace.first_month}
                  />
                </div>
              </details>

              <details className="group mt-3 border-t border-ink/8 pt-3">
                <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4 transition hover:text-ink">
                  Assign someone to this client
                </summary>
                <div className="mt-3">
                  <AssignTeamForm workspaceId={workspace.id} />
                </div>
              </details>
            </Card>
          );
        })}

        <Card>
          <SectionTitle>Add a reporting client</SectionTitle>
          <p className="mb-4 text-body text-ink/70">
            This sends an invitation and creates their workspace together, so a
            client can never exist with nobody able to reach it. They get a
            login that opens on their report and shows no other part of aOS.
          </p>
          <NewClientForm />
        </Card>
      </div>
    </>
  );
}
