"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeNextPath } from "./landing";
import { resolveNextPath } from "./landing-session";
import { headers } from "next/headers";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type AuthFormState = {
  error?: string;
  notice?: string;
} | null;

// Supabase returns messages fit for developers, not members. Map the ones people
// actually hit; anything unmapped falls through to a plain apology rather than a
// stack-trace-flavoured string.
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match. Do check both, or reset your password below.";
  }
  if (/email not confirmed/i.test(message)) {
    return "This account hasn't been activated yet. Use the link in your invitation email to set a password.";
  }
  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts just now. Wait a minute and try again.";
  }
  if (/password should be at least/i.test(message)) {
    return "That password is too short. It needs to be at least 8 characters.";
  }
  return "Something went wrong signing you in. Try again, and let us know if it keeps happening.";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Defaults to "/", which is the one place that knows whether this login
  // is a member or a reporting client. It used to default to /piazza, which
  // sent a retainer client straight to /no-access.
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter both your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");

  // A `next` that is internal still may not be theirs to use. The proxy sets
  // it to whatever page was requested while signed out, so an old tab can
  // carry a reporting client to a members-only screen, or to /no-access —
  // which is how Dom landed on "Your account isn't ready yet" on 5 October
  // with a working report. Anything this login cannot use becomes "/".
  const destination = await resolveNextPath(supabase, next);

  // Outside the error branch on purpose: redirect() signals by throwing, so it
  // must never sit inside a try/catch that would swallow it.
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Enter the email address you signed up with." };
  }

  // A Server Action doesn't always carry an `origin` header; falling back to the
  // configured site URL stops this quietly building a relative redirect that
  // Supabase rejects.
  const origin = (await headers()).get("origin") ?? env.siteUrl;

  if (!origin) {
    return {
      error:
        "Password resets aren't configured yet. Email hello@allegrostrategia.com and we'll help you in.",
    };
  }

  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/set-password`,
  });

  // Deliberately the same response whether or not the address exists — otherwise
  // this form becomes a way to find out who is a member.
  return {
    notice:
      "If that address belongs to a member, a reset link is on its way. Do check your spam folder.",
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Those two passwords don't match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  // "/" and not "/piazza": the root page is the only thing that knows
  // whether this login is a member or a reporting client. Sending everyone
  // to the portal meant a retainer client's very first sign-in, straight
  // after setting their password, landed on "Your account isn't ready yet"
  // — found on the Stage 2 walkthrough, 2 Oct.
  redirect("/");
}

/**
 * The three notification switches on You (L'Editoriale §10).
 *
 * The member's own session writes their own row; the members guard trigger
 * leaves these columns to them. Unchecked boxes don't post, so each switch is
 * read as present-or-absent from the form.
 */
export async function saveNotificationPreferences(formData: FormData): Promise<void> {
  const member = await requireMember();
  const supabase = await createClient();

  await supabase
    .from("members")
    .update({
      notify_reminders: formData.get("notify_reminders") === "on",
      notify_chat: formData.get("notify_chat") === "on",
      notify_pairing: formData.get("notify_pairing") === "on",
      push_chat: formData.get("push_chat") === "on",
      push_reactions: formData.get("push_reactions") === "on",
    })
    .eq("id", member.id);

  revalidatePath("/you");
}
