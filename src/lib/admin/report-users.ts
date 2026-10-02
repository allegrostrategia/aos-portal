"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { isSendableOrigin, localOriginRefusal } from "./invite-origin";
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
  if (!isSendableOrigin(origin)) {
    return { error: localOriginRefusal(origin) };
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
    if (!isSendableOrigin(origin)) {
      return { error: localOriginRefusal(origin) };
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

/**
 * Correct a client's details after they were created.
 *
 * There was no way to do this at all until 2 October, which is how a test
 * workspace ended up with its first month set to the month it was created
 * in — making every completed month unselectable, and the mistake
 * unfixable through the product.
 *
 * `first_month` is admin-only in the database (the guard trigger on
 * report_workspaces), so this is too. `kind`, the owner and the Chiarezza
 * access window are deliberately NOT editable here: changing the kind of a
 * workspace that already has figures in it changes who may read them.
 */
export async function saveWorkspaceSettings(
  _prev: ReportInviteState,
  formData: FormData,
): Promise<ReportInviteState> {
  await requireAdmin();

  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const firstMonthRaw = String(formData.get("first_month") ?? "").trim();

  if (!workspaceId) return { error: "Which client?" };
  if (!businessName) return { error: "A client needs a business name." };
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency should be a three-letter code, like GBP." };
  }

  const match = /^(\d{4})-(\d{2})/.exec(firstMonthRaw);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    return { error: "Give the first month as YYYY-MM." };
  }
  const firstMonth = `${match[1]}-${match[2]}-01`;

  const supabase = await createClient();

  // Moving the first month forward past anything that already exists would
  // hide it: the month picker only offers months from here on, so those rows
  // stay in the database and disappear from every screen — data loss where
  // nothing is deleted and nothing warns.
  //
  // Every table that is keyed by month, not just the figures. A published
  // period, a strategist note and a Trial Reels list are all just as
  // strandable, and checking only report_values would let two of the three
  // through.
  const MONTHLY_TABLES = [
    { table: "report_values", noun: "figures" },
    { table: "report_periods", noun: "a report" },
    { table: "report_notes", noun: "a note" },
    { table: "report_top_items", noun: "a Trial Reels list" },
  ] as const;

  const earliest: { month: string; noun: string }[] = [];
  for (const { table, noun } of MONTHLY_TABLES) {
    const { data, error: readError } = await supabase
      .from(table)
      .select("month")
      .eq("workspace_id", workspaceId)
      .order("month")
      .limit(1)
      .maybeSingle<{ month: string }>();

    // A failed read must not read as "nothing in the way". Without this the
    // guard passes on any error and the whole check is decorative.
    if (readError) {
      return { error: `Couldn't check ${table} before saving: ${readError.message}` };
    }
    if (data?.month) earliest.push({ month: data.month, noun });
  }

  const blocking = earliest
    .filter((e) => e.month < firstMonth)
    .sort((a, b) => a.month.localeCompare(b.month))[0];

  if (blocking) {
    return {
      error: `There is already ${blocking.noun} for ${blocking.month.slice(0, 7)}. Moving the first month later than that would hide it.`,
    };
  }

  const { data: updated, error } = await supabase
    .from("report_workspaces")
    .update({ business_name: businessName, currency, first_month: firstMonth })
    .eq("id", workspaceId)
    .select("id");

  if (error) return { error: `Couldn't save: ${error.message}` };

  // An id that matches nothing updates nothing and reports no error, so
  // without this a mistyped workspace cheerfully says "updated".
  if (!updated || updated.length !== 1) {
    return { error: "That client could not be found, so nothing was saved." };
  }

  revalidatePath("/admin/reporting");
  revalidatePath("/reporting", "layout");
  return { notice: `${businessName} updated.` };
}
