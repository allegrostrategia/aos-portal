"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { validateReportClient } from "./report-client-input";

/**
 * Creating the reporting tool's logins.
 *
 * The counterpart to inviteMember(), and deliberately NOT a variation of it:
 * a retainer client, a Chiarezza attendee and Elize each get an `auth.users`
 * account and no `members` row at all (Nina, 30 September 2026 — the
 * reasoning is at the top of 20260930120000_report_workspaces_access.sql).
 * Nothing here calls create_member(), and nothing here should be "tidied up"
 * to share a path with it: the whole point is that these two flows produce
 * different kinds of account.
 *
 * Same two-client split as inviteMember, for the same reason: the service
 * role sends the invitation because creating an auth user is an Auth API
 * call, and the admin's own session calls the RPC because it checks
 * is_portal_admin(), which reads auth.uid() — the service role has none.
 */

export type ReportInviteState = {
  error?: string;
  notice?: string;
} | null;

/**
 * Invite a reporting client and create their workspace in one go.
 *
 * `create_report_workspace()` grants the client their own access in the same
 * transaction, so there is no window in which a workspace exists that nobody
 * can reach.
 */
export async function inviteReportClient(
  _prev: ReportInviteState,
  formData: FormData,
): Promise<ReportInviteState> {
  // A Server Action is a public endpoint; this cannot rely on the page.
  await requireAdmin();

  const checked = validateReportClient({
    email: String(formData.get("email") ?? ""),
    displayName: String(formData.get("display_name") ?? ""),
    businessName: String(formData.get("business_name") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    firstMonth: String(formData.get("first_month") ?? ""),
    accessEnd: String(formData.get("access_end_date") ?? ""),
    currency: String(formData.get("currency") ?? "GBP"),
  });

  if ("error" in checked) return { error: checked.error };
  const { email, displayName, businessName, kind, firstMonth, accessEndDate, currency } =
    checked.plan;

  const origin = (await headers()).get("origin") ?? env.siteUrl;
  if (!origin) {
    return { error: "NEXT_PUBLIC_SITE_URL isn't set, so the invitation link would point nowhere." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/set-password`,
  });

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return {
        error: `${email} already has an account. If they are already in aOS, add the workspace to that account rather than inviting them again.`,
      };
    }
    if (/sending|smtp|email/i.test(error.message)) {
      return {
        error:
          "Supabase couldn't send the email. That is almost always the built-in email service, which only delivers to addresses on your Supabase organisation. No account was created, so this address can be invited again once sending works.",
      };
    }
    return { error: `Couldn't send the invitation: ${error.message}` };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: "Supabase accepted the invitation but returned no user." };
  }

  const supabase = await createClient();

  const { error: rpcError } = await supabase.rpc("create_report_workspace", {
    p_owner_user_id: userId,
    p_kind: kind,
    p_business_name: businessName,
    p_owner_display_name: displayName,
    p_first_month: firstMonth,
    p_currency: currency,
    ...(accessEndDate ? { p_access_end_date: accessEndDate } : {}),
  });

  if (rpcError) {
    // Without this we'd leave an auth user who can set a password and then
    // reach nothing at all — no members row, no reporting grant — and whose
    // address can't be invited again.
    await admin.auth.admin.deleteUser(userId);
    return {
      error: `The invitation was rolled back. Creating the workspace failed: ${rpcError.message}`,
    };
  }

  revalidatePath("/admin/reporting");

  return {
    notice: `Invitation sent to ${email}. ${businessName}'s workspace is ready for data.`,
  };
}

/**
 * Give an existing login — Elize's — access to one client's workspace.
 *
 * §2: "Team access is by assignment, not a blanket team role." There is no
 * team role anywhere in this schema; this row is the entire grant, and
 * removing it removes the access.
 */
export async function assignReportTeamMember(
  _prev: ReportInviteState,
  formData: FormData,
): Promise<ReportInviteState> {
  await requireAdmin();

  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!workspaceId || !email || !displayName) {
    return { error: "A workspace, an email address and a name are all needed." };
  }

  const admin = createAdminClient();

  // The team member may or may not have an account yet. Listing by email is
  // how the Auth API answers that; there is no "get user by email".
  const { data: existing, error: lookupError } = await admin.auth.admin.listUsers();
  if (lookupError) {
    return { error: `Couldn't check for an existing account: ${lookupError.message}` };
  }

  let userId = existing.users.find((u) => u.email?.toLowerCase() === email)?.id;

  if (!userId) {
    const origin = (await headers()).get("origin") ?? env.siteUrl;
    if (!origin) {
      return { error: "NEXT_PUBLIC_SITE_URL isn't set, so the invitation link would point nowhere." };
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/confirm?next=/set-password`,
    });
    if (error) return { error: `Couldn't send the invitation: ${error.message}` };

    userId = data.user?.id;
    if (!userId) return { error: "Supabase accepted the invitation but returned no user." };
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("assign_report_team_member", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_display_name: displayName,
  });

  if (rpcError) {
    return { error: `Couldn't assign them: ${rpcError.message}` };
  }

  revalidatePath("/admin/reporting");

  return { notice: `${displayName} can now work on this client's report.` };
}
