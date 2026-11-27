"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { accountKindForWorkspace, inviteData } from "./invite-kind";
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
  /** Set by `sendReportClientInvitation` on the first press. */
  needsConfirm?: boolean;
} | null;

/**
 * Step one: the client, with no login and no email (Nina, 27 November).
 *
 * **She does not want a reporting client invited before their data is
 * in.** Until today the only press that created a client also sent them
 * the first thing they ever receive from aOS, so "set them up, enter two
 * months, then invite them" was not a thing the product could do. These
 * two actions are that sentence.
 *
 * What this one does NOT do, and each absence is the point: no auth user,
 * no `report_access` grant, no email, and no origin check — nothing is
 * sent, so there is no link that could point at localhost.
 *
 * The team can enter figures and publish against the workspace
 * immediately. `publish-send.ts` already refuses to email a workspace
 * with no client grant and says so ("add their login and send again"),
 * which it has done since 5 October for a different reason.
 */
export async function setUpReportClient(
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

  // The admin's own session, not the service role: `set_up_report_client`
  // checks `is_portal_admin()`, which reads auth.uid().
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_up_report_client", {
    p_kind: kind,
    p_business_name: businessName,
    p_client_name: displayName,
    p_client_email: email,
    p_first_month: firstMonth,
    p_currency: currency,
    ...(accessEndDate ? { p_access_end_date: accessEndDate } : {}),
  });

  if (error) {
    if (/pending_email_shape/i.test(error.message)) {
      return { error: `${email} does not look like an email address.` };
    }
    return { error: `Couldn't set them up: ${error.message}` };
  }

  revalidatePath("/admin/reporting");

  return {
    notice:
      `${businessName} is set up and ready for figures. ${displayName} has not been ` +
      `invited yet — send that from their card when you want them to see it.`,
  };
}

/**
 * Step two: the login, the grant and the email.
 *
 * **The address comes from the workspace, never from the form.** This is
 * submitted by a button on a card in a list of every client, so a posted
 * address would be an invitation anybody who can reach a Server Action
 * could point anywhere. The row holds what Nina typed at set-up and the
 * database only lets an admin change it.
 *
 * **Two presses**, the same shape as ending and restoring access below.
 * This one sends a real person their first email from aOS and there is no
 * recalling it, so the first press names the address and says whether
 * there is anything published for them to read yet — which is the exact
 * thing Nina split this flow in two to control.
 *
 * The rollback is the one from the old one-step version, and it matters
 * more here: an auth user with no workspace can set a password, reach
 * nothing, and cannot be invited again.
 */
export async function sendReportClientInvitation(
  _prev: ReportInviteState,
  formData: FormData,
): Promise<ReportInviteState> {
  await requireAdmin();

  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  if (!workspaceId) return { error: "Which client?" };

  const supabase = await createClient();

  const { data: workspace, error: readError } = await supabase
    .from("report_workspaces")
    .select("id, kind, business_name, owner_user_id, pending_client_email, pending_client_name")
    .eq("id", workspaceId)
    .maybeSingle<{
      id: string;
      kind: "retainer" | "aos_member" | "chiarezza";
      business_name: string;
      owner_user_id: string | null;
      pending_client_email: string | null;
      pending_client_name: string | null;
    }>();

  if (readError) return { error: `Couldn't read that client: ${readError.message}` };
  if (!workspace) return { error: "That client could not be found." };

  if (workspace.owner_user_id) {
    return {
      error: `${workspace.business_name} already has a client login. Nothing was sent.`,
    };
  }
  if (!workspace.pending_client_email || !workspace.pending_client_name) {
    return {
      error:
        `${workspace.business_name} has no contact to invite. Add their name and ` +
        `address under Edit details first.`,
    };
  }
  if (workspace.kind === "aos_member") {
    return {
      error:
        "An aOS member already has a login. Their reporting attaches to their member record.",
    };
  }

  const email = workspace.pending_client_email;
  const contactName = workspace.pending_client_name;

  if (String(formData.get("confirm") ?? "") !== "1") {
    // Said before it is sent, not after: this is the first thing the
    // client ever receives from aOS, and whether a month is waiting for
    // them is the whole question.
    const { count, error: countError } = await supabase
      .from("report_periods")
      .select("month", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .not("published_at", "is", null);

    // **A failed read must not read as "nothing published".** That is the
    // one fact this question exists to carry, and getting it wrong the
    // quiet way would say "they will see being prepared" about a client
    // with six months waiting. Same rule as the first-month check in
    // `saveWorkspaceSettings`.
    const published =
      countError || count === null
        ? `I couldn't check what is published for them${countError ? ` (${countError.message})` : ""}. `
        : count > 0
          ? `${count === 1 ? "One month is" : `${count} months are`} published, so ` +
            `there is something there when they sign in. `
          : `Nothing is published yet, so they will sign in and see "being prepared". `;

    return {
      needsConfirm: true,
      error:
        `This emails ${contactName} at ${email} and creates their login. ` +
        published +
        `Press again to send it.`,
    };
  }

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
    // Which of the invitation template's branches they get. A reporting
    // client is not joining a membership, and the one template used to
    // tell them they were — see invite-kind.ts.
    data: inviteData(accountKindForWorkspace(workspace.kind)),
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

  const { error: rpcError } = await supabase.rpc("invite_report_client_login", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });

  if (rpcError) {
    // Without this we would leave an auth user who can set a password and
    // then reach nothing at all — no members row, no reporting grant — and
    // whose address cannot be invited again. The likeliest cause is the
    // second of two presses a second apart, which the row lock in
    // `invite_report_client_login` turns into this refusal.
    await admin.auth.admin.deleteUser(userId);
    return {
      error: `The invitation was rolled back. Giving them access failed: ${rpcError.message}`,
    };
  }

  revalidatePath("/admin/reporting");
  revalidatePath("/reporting", "layout");

  return {
    notice: `Invitation sent to ${email}. ${contactName} can set a password and read ${workspace.business_name}'s report.`,
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
      // Elize is not a client and not a member. Without this she was
      // told her aOS login was ready and that everything she was going
      // to come to love lived there, about a tool she works in.
      data: inviteData("team"),
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
  // Absent when the workspace has no client login yet, in which case the
  // field is not rendered and there is no name to correct.
  const contactNameRaw = formData.get("contact_name");
  // And the other way round: before the invitation goes, the contact is
  // two columns on the workspace rather than a grant, and they are the
  // address the invitation will be sent to. A typo at set-up was
  // unfixable through the product without this — the same hole the first
  // paragraph of this docblock is about, one step earlier.
  const pendingNameRaw = formData.get("pending_client_name");
  const pendingEmailRaw = formData.get("pending_client_email");
  // Blank clears it. §5.9's dashed line on the hourly-rate chart is the
  // only thing that reads it, and until 5 October nothing could set it at
  // all — so the line could never appear on anybody's report.
  const targetRateRaw = String(formData.get("target_hourly_rate") ?? "").trim();
  const contactName =
    contactNameRaw === null ? null : String(contactNameRaw).trim();

  if (!workspaceId) return { error: "Which client?" };
  if (contactName !== null && contactName === "") {
    // display_name is NOT NULL, and it is the only name the app has for a
    // reporting client — they have no `members` row by design.
    return { error: "The client contact needs a name." };
  }
  if (!businessName) return { error: "A client needs a business name." };

  const pendingName = pendingNameRaw === null ? null : String(pendingNameRaw).trim();
  const pendingEmail =
    pendingEmailRaw === null ? null : String(pendingEmailRaw).trim().toLowerCase();

  if (pendingName !== null && pendingName === "") {
    return { error: "The client contact needs a name." };
  }
  // The same shape the database checks. Said here so it is a sentence
  // rather than a constraint name, and checked there so it is true of
  // every writer.
  if (pendingEmail !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pendingEmail)) {
    return { error: `${pendingEmail || "That"} does not look like an email address.` };
  }
  // Both or neither: they are one contact, and the database refuses half
  // of one.
  if ((pendingName === null) !== (pendingEmail === null)) {
    return { error: "A contact who has not been invited yet needs both a name and an address." };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency should be a three-letter code, like GBP." };
  }

  let targetHourlyRate: number | null = null;
  if (targetRateRaw !== "") {
    const parsed = Number(targetRateRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "A target hourly rate should be a number above zero, or blank." };
    }
    targetHourlyRate = parsed;
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
    .update({
      business_name: businessName,
      currency,
      first_month: firstMonth,
      target_hourly_rate: targetHourlyRate,
      // Only ever on a client who has not been invited: the form renders
      // these two for nobody else, and
      // `report_workspaces_pending_only_before_the_login` refuses them on
      // a workspace that has a login.
      ...(pendingName !== null && pendingEmail !== null
        ? { pending_client_name: pendingName, pending_client_email: pendingEmail }
        : {}),
    })
    .eq("id", workspaceId)
    .select("id");

  if (error) return { error: `Couldn't save: ${error.message}` };

  // An id that matches nothing updates nothing and reports no error, so
  // without this a mistyped workspace cheerfully says "updated".
  if (!updated || updated.length !== 1) {
    return { error: "That client could not be found, so nothing was saved." };
  }

  // The contact's own name, on their grant rather than on the workspace.
  //
  // It needs correcting from a screen because it is what signs that login's
  // replies to the report, and there was no way to change it: Test Client's
  // contact read "Nina" from a mistyped invitation, so the client's own
  // words appeared signed with their strategist's name. Found 5 October by
  // the closing Stage 2 check.
  //
  // The client grant only. A team member's display_name is set when they are
  // assigned and is not this form's business.
  if (contactName !== null) {
    const { data: grants, error: grantError } = await supabase
      .from("report_access")
      .update({ display_name: contactName })
      .eq("workspace_id", workspaceId)
      .eq("role", "client")
      // Not an ended grant: that row is the record of who held access and
      // when it stopped, and renaming it would rewrite the record.
      .is("revoked_at", null)
      .select("id");

    if (grantError) {
      return { error: `Saved the details, but not the contact name: ${grantError.message}` };
    }
    // Nothing matched means the client login went away between the page
    // rendering and this save. The workspace's own fields are already
    // written, so this says what did and did not happen rather than
    // pretending both halves worked.
    if (!grants || grants.length === 0) {
      return {
        error: `${businessName} updated, but there is no client login on it to name.`,
      };
    }
  }

  revalidatePath("/admin/reporting");
  revalidatePath("/reporting", "layout");
  return { notice: `${businessName} updated.` };
}

/**
 * Ending a retainer client's access to their workspace.
 *
 * The gap this fills, found in the pre-launch account audit on 29 October:
 * there was no way to stop a reporting login at all. `cancel_member()` needs
 * a `members` row and a retainer client deliberately has none;
 * `access_end_date` is constrained to Chiarezza; `unassign_report_team_member`
 * only touches `role = 'team'`. The alternatives were deleting the grant by
 * hand or disabling the auth user in the Supabase dashboard — one destroys
 * the record, the other is invisible from inside aOS.
 *
 * **Nothing is deleted.** The grant row stays, marked with when it ended and
 * who ended it, and every month, figure, note and reply stays exactly where
 * it is and stays readable to Nina. What changes is that `report_can_view()`
 * stops admitting that login.
 *
 * **Two presses**, the same shape as publishing a month out of order: the
 * first returns `needsConfirm` and the sentence about what will happen, the
 * second carries `confirm` and does it. Server state rather than `useState`,
 * so the step exists before hydration too — there is no undo on this screen,
 * and a stray click on a real client is not a thing to find out about from
 * their email.
 */
export type EndAccessState = {
  error?: string;
  notice?: string;
  needsConfirm?: boolean;
} | null;

export async function endReportClientAccess(
  _prev: EndAccessState,
  formData: FormData,
): Promise<EndAccessState> {
  // A Server Action is a public endpoint; this cannot rely on the page.
  await requireAdmin();

  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();

  if (!workspaceId || !userId) {
    return { error: "No client given." };
  }

  if (String(formData.get("confirm") ?? "") !== "1") {
    return {
      needsConfirm: true,
      error:
        `This signs ${contactName || "their contact"} out of ${businessName || "this client"} ` +
        `for good and there is no undo on this screen. Every month, figure and reply is kept ` +
        `and stays readable to you. Press again to end it.`,
    };
  }

  // The admin's own session, not the service role: the function checks
  // `is_portal_admin()`, which reads auth.uid(), and the service role has
  // none — it would be refused as "only an admin can end a client's access".
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_report_client_access", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/reporting");
  revalidatePath("/reporting", "layout");

  // **Nobody reads this notice on the admin screen**, and that is correct
  // rather than a bug to route around: the disclosure is rendered from the
  // live client grant, so the revalidate above unmounts the form and takes
  // its message with it. What the admin sees instead is the card itself,
  // now carrying "Access ended — <name> on <date>", which is the same way a
  // saved figure reports itself everywhere else here. The notice stays
  // because it is the action's honest answer to its caller.
  return {
    notice: `Access ended. ${businessName || "The client"}'s reports are all still here.`,
  };
}

/**
 * Give an ended retainer client their access back.
 *
 * Shares `EndAccessState` and the two-press shape with the action above, on
 * purpose. Restoring is not destructive the way ending is, but it is still
 * handing a person outside Allegro the key to a live report — and on a screen
 * listing every client, a single press next to a name is too easy to give to
 * the wrong one. The warning names them for the same reason the other does.
 */
export async function restoreReportClientAccess(
  _prev: EndAccessState,
  formData: FormData,
): Promise<EndAccessState> {
  await requireAdmin();

  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();

  if (!workspaceId || !userId) {
    return { error: "No client given." };
  }

  if (String(formData.get("confirm") ?? "") !== "1") {
    return {
      needsConfirm: true,
      error:
        `This lets ${contactName || "their contact"} back into ${businessName || "this client"} ` +
        `and into every month it already holds, and they will be emailed again when one is ` +
        `published. Press again to restore it.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_report_client_access", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/reporting");
  revalidatePath("/reporting", "layout");

  // Same as above: the disclosure this is submitted from is rendered from an
  // ENDED grant, so restoring unmounts it. The card going back to naming them
  // as the client is the confirmation.
  return {
    notice: `Access restored. ${contactName || "They"} can open ${businessName || "this client"} again.`,
  };
}
