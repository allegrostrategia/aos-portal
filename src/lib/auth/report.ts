import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/member";

/**
 * Who is signed in, for the reporting tool.
 *
 * The reporting tool has users the rest of aOS does not: retainer clients,
 * Chiarezza attendees and Elize all hold an `auth.users` account and no
 * `members` row (Nina, 30 September 2026 — see the top of
 * 20260930120000_report_workspaces_access.sql for why). `requireMember()`
 * redirects anyone without a members row to /no-access, so it is the wrong
 * gate here and this is the right one.
 *
 * Note what this does NOT do: it never reads `auth.users` for a name. Those
 * rows are not readable under RLS, which is why `report_access.display_name`
 * exists.
 */

export type ReportRole = "client" | "team";

export interface ReportGrant {
  workspace_id: string;
  role: ReportRole;
  display_name: string;
  business_name: string;
  kind: "retainer" | "aos_member" | "chiarezza";
}

export interface ReportUser {
  id: string;
  /** Every workspace this login can reach. Expiry is applied in the database. */
  grants: ReportGrant[];
  /** True for Nina. Admins reach every workspace without a grant of their own. */
  isAdmin: boolean;
}

/**
 * The current reporting user, or null when this login has no reporting access
 * at all.
 *
 * An admin with no grants is still a reporting user — every policy admits
 * `is_portal_admin()` outright — so they come back with an empty `grants` list
 * and `isAdmin` true rather than as null.
 *
 * Cached per request, the same as getCurrentMember(), so a layout and its page
 * do not each pay for it.
 */
export const getReportUser = cache(async (): Promise<ReportUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // An expired Chiarezza workspace is filtered out by RLS — report_can_view()
  // applies access_end_date — so an empty list here is the same answer the
  // database would give, not something this code has to remember to check.
  const { data } = await supabase
    .from("report_access")
    .select("workspace_id, role, display_name, report_workspaces!inner(business_name, kind)")
    .returns<
      {
        workspace_id: string;
        role: ReportRole;
        display_name: string;
        report_workspaces: { business_name: string; kind: ReportGrant["kind"] };
      }[]
    >();

  const grants: ReportGrant[] = (data ?? []).map((row) => ({
    workspace_id: row.workspace_id,
    role: row.role,
    display_name: row.display_name,
    business_name: row.report_workspaces.business_name,
    kind: row.report_workspaces.kind,
  }));

  const member = await getCurrentMember();
  const isAdmin = member?.role === "admin" && member.status !== "cancelled";

  if (grants.length === 0 && !isAdmin) return null;

  return { id: user.id, grants, isAdmin };
});

/**
 * The gate for every reporting screen. Call it in the layout, not each page.
 */
export async function requireReportUser(): Promise<ReportUser> {
  const reportUser = await getReportUser();

  if (!reportUser) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Authenticated but with nothing to see. /no-access already explains
    // itself for both the cancelled member and the account that is not ready,
    // and an expired Chiarezza login is the same situation from the person's
    // side: they had access, and now they do not.
    redirect(user ? "/no-access" : "/login");
  }

  return reportUser;
}

/**
 * Which workspace a screen should show, given what the URL asked for.
 *
 * §13: a client user must never see a client switcher or any sign that other
 * clients exist. That is a rendering rule, and this is the other half of it —
 * asking for a workspace you hold no grant on gets you your own, not an error
 * page that confirms the other one is there.
 */
export function resolveWorkspace(
  reportUser: ReportUser,
  requested?: string,
): ReportGrant | null {
  if (requested) {
    const match = reportUser.grants.find((g) => g.workspace_id === requested);
    if (match) return match;
  }
  return reportUser.grants[0] ?? null;
}
