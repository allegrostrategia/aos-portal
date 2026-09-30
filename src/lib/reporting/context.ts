import "server-only";

import { redirect } from "next/navigation";

import { requireReportUser, type ReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace, type ReportWorkspace } from "./queries.ts";
import { resolveMonth, type MonthView } from "./months.ts";

/**
 * Which business, which month, and what this person may do — resolved once.
 *
 * §13 asks for shared helpers defined once and never guessed at. Every
 * reporting page needs the same four answers, and working them out per page
 * is how one screen ends up letting a retainer client edit because its author
 * wrote the rule slightly differently.
 *
 * On `canEdit` being decided here as well as in the database: §13 asks for
 * security in both RLS and code, never RLS alone. This is the code half. The
 * database is the half that holds when this one is wrong.
 */

export interface ReportContext {
  reportUser: ReportUser;
  workspace: ReportWorkspace;
  month: MonthView;
  /** May change figures: a team member, or a self-serve client's own. */
  canEdit: boolean;
  /** Publishing is Nina's alone (30 Sep 2026). */
  canPublish: boolean;
  /** Draws the business picker. Never for someone with one business. */
  showWorkspacePicker: boolean;
  /** Everything this login may open, which RLS has already filtered. */
  choices: { id: string; business_name: string }[];
}

/**
 * Every workspace this login can read.
 *
 * RLS decides the list, so it is already only theirs: a retainer client gets
 * their own, Elize gets the ones she is assigned to, Nina gets all of them.
 * That is why showing a picker from this list cannot leak the existence of
 * another client — there is nothing in it that is not already theirs.
 */
export async function getVisibleWorkspaces(): Promise<
  { id: string; business_name: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_workspaces")
    .select("id, business_name")
    .order("business_name")
    .returns<{ id: string; business_name: string }[]>();

  return data ?? [];
}

/**
 * Resolve the page's context, or send the person somewhere that makes sense.
 *
 * Redirects rather than throwing: an out-of-range month or a workspace this
 * login cannot see should land on a real screen, not an error page that
 * confirms the other workspace exists.
 */
export async function resolveReportContext(
  searchParams: { workspace?: string; month?: string },
  today = new Date().toISOString().slice(0, 10),
): Promise<ReportContext> {
  const reportUser = await requireReportUser();
  const choices = await getVisibleWorkspaces();

  if (choices.length === 0) {
    // An admin who has not set up any client yet. Nothing to show, and
    // /no-access explains itself better than an empty report would.
    redirect("/no-access");
  }

  const asked = searchParams.workspace;
  // An id they cannot see falls back to their first rather than 404ing —
  // §13: never confirm that another client exists.
  const chosen = (asked && choices.find((c) => c.id === asked)?.id) ?? choices[0].id;

  const workspace = await getWorkspace(chosen);
  if (!workspace) redirect("/no-access");

  const month = resolveMonth(searchParams.month, today, workspace.first_month);

  const grant = reportUser.grants.find((g) => g.workspace_id === workspace.id);

  // A retainer client views and comments; they never enter figures (§2's role
  // table). A team assignment always edits. An admin edits everything.
  const canEdit =
    reportUser.isAdmin ||
    grant?.role === "team" ||
    (grant?.role === "client" && workspace.kind !== "retainer");

  return {
    reportUser,
    workspace,
    month,
    canEdit,
    canPublish: reportUser.isAdmin,
    showWorkspacePicker: choices.length > 1,
    choices,
  };
}

/** Keeps `?workspace=` and `?month=` on every link without retyping them. */
export function reportHref(
  path: string,
  ctx: Pick<ReportContext, "workspace" | "month"> & { showWorkspacePicker?: boolean },
  overrides: { month?: string; workspace?: string } = {},
): string {
  const params = new URLSearchParams();
  // Only carried when there is a choice to preserve — a client with one
  // business gets clean URLs with nothing in them to fiddle with.
  const workspace = overrides.workspace ?? (ctx.showWorkspacePicker ? ctx.workspace.id : null);
  if (workspace) params.set("workspace", workspace);

  const month = overrides.month ?? ctx.month.month;
  params.set("month", month.slice(0, 7));

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
