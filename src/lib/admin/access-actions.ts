"use server";

import { randomInt } from "node:crypto";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type AccessState = { error?: string; notice?: string; password?: string } | null;

/**
 * Getting a locked-out member back in, from their admin page (Dom, 20 Sep
 * 2026: "exactly the kind of thing that'll come up again with real members").
 *
 * Two ways, for two situations:
 *
 *   · Send a reset link — the same recovery email the /forgot-password form
 *     sends, triggered by Nina instead. For the member who says "I can't get
 *     in" and can read their inbox. Nothing to hand over.
 *
 *   · Set a temporary password — written straight onto the auth user with the
 *     service role and shown once, here, for Nina to pass on. For the member
 *     whose inbox is the problem (a dead address, a link that never lands), and
 *     for test accounts. They change it on /set-password once in.
 *
 * Neither works on an admin account: setting another admin's password is a
 * way to take their account, and the two admins can use /forgot-password
 * like anyone else. Neither works on a cancelled member, who has no access
 * to restore.
 *
 * Both are Server Actions, which are public endpoints, so each re-checks
 * admin rather than trusting the page that rendered the button.
 */

async function loadTarget(memberId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("id, email, full_name, role, status")
    .eq("id", memberId)
    .maybeSingle();
  return data as
    | { id: string; email: string; full_name: string; role: string; status: string }
    | null;
}

function refusal(target: Awaited<ReturnType<typeof loadTarget>>): string | null {
  if (!target) return "No such member.";
  if (target.role === "admin") {
    return "Admin accounts reset their own password from the sign-in page. This isn't offered for them here.";
  }
  if (target.status === "cancelled") {
    return "This membership is cancelled, so there's no access to restore. Reinstate them first if they're rejoining.";
  }
  return null;
}

export async function sendResetLink(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) return { error: "No member given." };

  const target = await loadTarget(memberId);
  const refused = refusal(target);
  if (refused || !target) return { error: refused ?? "No such member." };

  // Same origin logic as the invitation: the link in the email has to point
  // at this deployment, and Supabase only accepts a redirect it knows.
  const origin = (await headers()).get("origin") ?? env.siteUrl;
  if (!origin) {
    return { error: "NEXT_PUBLIC_SITE_URL isn't set, so the reset link would point nowhere." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
    redirectTo: `${origin}/auth/confirm?next=/set-password`,
  });
  if (error) return { error: `Couldn't send it: ${error.message}` };

  return {
    notice: `Reset link sent to ${target.email}. It lands on the choose-a-password page and is good for an hour. Worth telling them to check spam.`,
  };
}

/**
 * Letters and digits that can't be misread over the phone: no 0/O, 1/l/I.
 * Twelve of them is well past what a guess could reach, and short enough to
 * type on a phone from a text message.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function temporaryPassword(): string {
  let out = "";
  for (let i = 0; i < 12; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export async function setTemporaryPassword(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) return { error: "No member given." };

  const target = await loadTarget(memberId);
  const refused = refusal(target);
  if (refused || !target) return { error: refused ?? "No such member." };

  // The service role, because only the auth admin API can set a password
  // for a user other than the one signed in. The admin check is above; the
  // member row was read through the admin's own session, so a made-up id
  // never reaches this line.
  const password = temporaryPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(target.id, { password });
  if (error) return { error: `Couldn't set it: ${error.message}` };

  return {
    notice: `Temporary password set for ${target.full_name}. Shown once, here. Pass it on however suits, and ask them to change it on You once they're in.`,
    password,
  };
}
