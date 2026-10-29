import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { Badge, Card, Eyebrow, PageHeader, SectionTitle } from "@/components/ui/card";
import { getMemberReportStatuses } from "@/lib/admin/member-report-status";
import { monthLabel as reportMonthLabel } from "@/lib/reporting/months";
import { buttonClasses } from "@/components/ui/button";
import { monthLabel } from "@/lib/reporting/months";
import { getReportClientData, type ReportPeriodRow } from "@/lib/admin/report-clients";
import {
  NewClientForm,
  AssignTeamForm,
  EditWorkspaceForm,
  EndAccessForm,
} from "./forms";

export const metadata: Metadata = {
  title: "Reporting clients · aOS admin",
};

/**
 * The order the three kinds are shown in, and what each one is.
 *
 * Retainer first because it is the work Nina does; members second
 * because there will be the most of them and she mostly only looks when
 * one is behind; Chiarezza last because it is temporary by design.
 */
const KIND_SECTIONS = [
  {
    kind: "retainer" as const,
    title: "Retainer clients",
    blurb: "Allegro enters their figures and publishes their month to them.",
  },
  {
    kind: "aos_member" as const,
    title: "aOS members",
    blurb: "They fill in their own, every category. Nothing here is yours to enter.",
  },
  {
    kind: "chiarezza" as const,
    title: "Chiarezza",
    blurb: "Self-serve, with an end date on their access.",
  },
];

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

  // RLS returns every workspace because is_portal_admin() is true.
  // Paged, with a unique sort. Both parts matter, and the second was
  // missing until 5 October: see getReportClientData.
  const { workspaces, grants, periods } = await getReportClientData();

  const rows = workspaces;
  // §8.1's admin view: where each member is with last month, and what
  // they have turned off. Read-only — she still enters nothing.
  const memberStatus = await getMemberReportStatuses(rows);
  // A grant whose access has been ended is kept as the record of it, so these
  // are three groups and not two: who can reach this client's report now, who
  // used to, and who on the team is assigned. Counting rows would read an
  // ended client as a current one.
  type People = {
    client: { userId: string; name: string } | null;
    ended: { name: string; on: string }[];
    team: string[];
  };
  const byWorkspace = new Map<string, People>(
    rows.map((w) => [w.id, { client: null, ended: [], team: [] }]),
  );
  for (const grant of grants) {
    const entry = byWorkspace.get(grant.workspace_id);
    if (!entry) continue;
    if (grant.role === "client") {
      if (grant.revoked_at) entry.ended.push({ name: grant.display_name, on: grant.revoked_at });
      else entry.client = { userId: grant.user_id, name: grant.display_name };
    } else if (!grant.revoked_at) {
      entry.team.push(grant.display_name);
    }
  }

  const monthsFor = new Map<string, ReportPeriodRow[]>();
  for (const period of periods) {
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

        {/* **Three lists, not one** (Dom, 9 Oct). Once a member's
            workspace is created with the member, this page stops being a
            handful of clients Nina set up by hand and becomes every
            member as well. Ungrouped it would be a long scroll with the
            retainer clients she actually works on buried somewhere in
            it. `fetchAllPages` returns the lot, so the counts are the
            real ones rather than this page's. */}
        {KIND_SECTIONS.map(({ kind, title, blurb }) => {
          const group = rows.filter((w) => w.kind === kind);
          if (group.length === 0) return null;

          return (
            <section key={kind} className="flex flex-col gap-6">
              <div>
                <Eyebrow>
                  {title} · {group.length}
                </Eyebrow>
                <p className="mt-1 text-small text-ink/60">{blurb}</p>
              </div>

              {group.map((workspace) => {
          const people = byWorkspace.get(workspace.id);
          const months = monthsFor.get(workspace.id) ?? [];
          const published = months.filter((m) => m.published_at).length;
          // Only failures. A list that says "emailed" against every month is
          // a list nobody reads, and the point of putting this here is that
          // a failure is seen without opening each client.
          const emailFailures = months.filter((m) => m.email_error);

          return (
            <Card key={workspace.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-display text-heading font-medium text-ink">
                    {workspace.business_name}
                  </h2>
                  <p className="mt-1 text-small text-ink/60">
                    {people?.client ? `${people.client.name} · ` : null}
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
                {emailFailures.length > 0 ? (
                  <div className="min-w-60">
                    <dt className="text-caption text-ink/55">Publish email</dt>
                    <dd className="text-body text-deep-red">
                      Failed for{" "}
                      {emailFailures.map((m) => monthLabel(m.month)).join(", ")} —
                      open the report to see why and send again
                    </dd>
                  </div>
                ) : null}
                {memberStatus.get(workspace.id) ? (
                  <div className="min-w-60">
                    <dt className="text-caption text-ink/55">
                      {reportMonthLabel(memberStatus.get(workspace.id)!.month)}
                    </dt>
                    <dd
                      data-member-status={workspace.id}
                      className={`text-body ${
                        memberStatus.get(workspace.id)!.done ? "text-ink" : "text-orange"
                      }`}
                    >
                      {memberStatus.get(workspace.id)!.done
                        ? "Finished"
                        : "Not finished yet"}
                      {memberStatus.get(workspace.id)!.hiddenLabels.length > 0 ? (
                        <span className="block text-caption text-ink/55">
                          Turned off: {memberStatus.get(workspace.id)!.hiddenLabels.join(", ")}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {people && people.ended.length > 0 ? (
                  // Said on the card rather than only inside a disclosure:
                  // "why can't they open their report" is the question this
                  // answers, and it is asked from this list.
                  <div className="min-w-60">
                    <dt className="text-caption text-ink/55">Access ended</dt>
                    <dd className="text-body text-ink">
                      {people.ended
                        .map((e) => `${e.name} on ${e.on.slice(0, 10)}`)
                        .join(", ")}
                    </dd>
                  </div>
                ) : null}
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
                    contactName={people?.client?.name ?? null}
                    targetHourlyRate={workspace.target_hourly_rate}
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

              {/* Retainer only, because the other two kinds already have a
                  route and a third would behave differently: an aOS member's
                  reporting goes when the membership does (rule 7), and a
                  Chiarezza login runs to the end date set when they were
                  invited. `end_report_client_access` refuses them both and
                  names the right route, so this is not the only guard. */}
              {workspace.kind === "retainer" && people?.client ? (
                <details className="group mt-3 border-t border-ink/8 pt-3">
                  <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4 transition hover:text-ink">
                    End this client&rsquo;s access
                  </summary>
                  <div className="mt-3">
                    <EndAccessForm
                      workspaceId={workspace.id}
                      userId={people.client.userId}
                      businessName={workspace.business_name}
                      contactName={people.client.name}
                    />
                  </div>
                </details>
              ) : null}
            </Card>
          );
              })}
            </section>
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
