"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

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
    return "That password is too short — it needs to be at least 8 characters.";
  }
  return "Something went wrong signing you in. Try again, and let us know if it keeps happening.";
}

/**
 * Only internal paths are accepted as a post-login destination, so a crafted
 * ?next=https://elsewhere can't turn the login form into an open redirect.
 */
function safeRedirectPath(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  return "/piazza";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter both your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  // Outside the error branch on purpose: redirect() signals by throwing, so it
  // must never sit inside a try/catch that would swallow it.
  redirect(next);
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
  redirect("/piazza");
}
