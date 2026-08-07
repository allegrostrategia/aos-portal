"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type InviteState = {
  error?: string;
  notice?: string;
} | null;

/**
 * Invite a member and create their record. This is what actually starts someone's
 * onboarding sequence (Build Brief §7).
 *
 * Two clients, deliberately:
 *
 *   - The ADMIN client sends the invitation, because creating an auth user is an
 *     Auth API call that needs the service role.
 *   - The ADMIN'S OWN session calls create_member(), because that function checks
 *     is_portal_admin(), which reads auth.uid(). The service-role client has no
 *     auth.uid() at all, so calling it there would fail the permission check it
 *     exists to enforce — and bypassing RLS to insert directly would skip the
 *     payment-and-contract rule the database is holding on our behalf.
 */
export async function inviteMember(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  // Redirects a non-admin rather than returning — a Server Action is a public
  // endpoint, so this cannot rely on the page having checked.
  await requireAdmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const joinDate = String(formData.get("join_date") ?? "").trim();
  const termMonths = Number(formData.get("contract_term_months") ?? 6);
  const paymentConfirmed = formData.get("payment_confirmed") === "on";
  const contractSigned = formData.get("contract_signed") === "on";

  if (!email || !fullName) {
    return { error: "Both an email address and a name are needed." };
  }

  // The database enforces this too. Checking here as well means the admin gets a
  // sentence rather than a Postgres exception.
  if (!paymentConfirmed || !contractSigned) {
    return {
      error:
        "Confirm both payment and the signed contract before creating a member — that's the whole reason this step is manual.",
    };
  }

  if (!Number.isInteger(termMonths) || termMonths < 1) {
    return { error: "Contract term must be a whole number of months." };
  }

  const origin = (await headers()).get("origin") ?? env.siteUrl;
  if (!origin) {
    return {
      error:
        "NEXT_PUBLIC_SITE_URL isn't set, so the invitation link would point nowhere.",
    };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/set-password`,
  });

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return {
        error: `${email} already has an account. If they're rejoining, use their existing record rather than inviting them again.`,
      };
    }

    // Supabase's built-in email service is a testing convenience: a couple of
    // messages an hour, and only to addresses on the Supabase organisation.
    // Inviting an actual member therefore fails here until custom SMTP is
    // configured. Observed behaviour is that no auth user is created when the
    // send fails, so the address stays invitable — worth re-checking if that
    // ever changes, because a stranded auth user can't be re-invited.
    if (/sending|smtp|email/i.test(error.message)) {
      return {
        error:
          "Supabase couldn't send the email. This is almost always the built-in email service, which only delivers to addresses on your Supabase organisation and allows a couple of messages an hour. Configure custom SMTP under Project Settings → Authentication. No account was created, so this address can be invited again once sending works.",
      };
    }

    return { error: `Couldn't send the invitation: ${error.message}` };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: "Supabase accepted the invitation but returned no user." };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { error: rpcError } = await supabase.rpc("create_member", {
    p_user_id: userId,
    p_email: email,
    p_full_name: fullName,
    p_payment_confirmed_at: nowIso,
    p_contract_signed_at: nowIso,
    p_contract_term_months: termMonths,
    ...(joinDate ? { p_join_date: joinDate } : {}),
  });

  if (rpcError) {
    // Undo the invitation. Without this we'd leave an auth user with no member
    // row — someone who can accept an invitation, set a password, and land on
    // /no-access with no way forward, and whose email can't be re-invited.
    await admin.auth.admin.deleteUser(userId);

    return {
      error: `The invitation was rolled back — creating the member record failed: ${rpcError.message}`,
    };
  }

  revalidatePath("/admin/members");

  return {
    notice: `Invitation sent to ${email}. Their onboarding starts when they set a password.`,
  };
}
