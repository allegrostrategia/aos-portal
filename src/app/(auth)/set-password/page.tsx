import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Choose a password — aOS",
};

/**
 * Where an invitation lands after /auth/confirm has verified the link, and where
 * a password reset finishes.
 *
 * Note this does NOT call requireMember(): an invited member may not have a
 * `members` row yet, and locking them out of setting a password would be an
 * excellent way to make onboarding impossible.
 */
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reaching this page without a verified link means there's no session to
  // attach a new password to.
  if (!user) {
    redirect("/login?error=link");
  }

  return (
    <>
      <h1 className="font-display mb-1 text-2xl italic text-navy">
        Choose a password
      </h1>
      <p className="mb-6 text-sm text-navy/70">
        Signed in as {user.email}. Pick something you&rsquo;ll remember — this is
        how you&rsquo;ll get back in.
      </p>

      <SetPasswordForm />
    </>
  );
}
