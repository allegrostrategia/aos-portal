import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/supabase/types";

/**
 * The current member, or null.
 *
 * Two distinct nulls are possible and they mean different things:
 *   - no session at all — nobody is logged in
 *   - a session but no `members` row — an invited auth user whose member record
 *     hasn't been created yet, or an orphan. They are authenticated but not a
 *     member, which is why /no-access exists.
 *
 * Wrapped in React's `cache` so a layout and its pages sharing a request don't
 * each pay for the round trip.
 */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();

  // getUser() revalidates the token with Supabase rather than trusting the
  // cookie. Slower than reading the cookie, and correct — this is the check
  // everything else depends on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS returns their own row and nothing else, so no filtering to get wrong.
  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Member | null) ?? null;
});

/**
 * The gate for every member-facing screen. Call it in the layout, not in each
 * page — the proxy's check is optimistic (cookie only, no database), so this is
 * the one that actually decides.
 */
export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember();

  if (!member) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Authenticated but not a member: they need telling why, not a login form
    // they'd fill in successfully and bounce off again.
    redirect(user ? "/no-access" : "/login");
  }

  // Cancelled members keep every record but reach nothing. Their own row stays
  // readable precisely so this page can explain itself.
  if (member.status === "cancelled") {
    redirect("/no-access");
  }

  return member;
}

/**
 * For the admin panel. Deliberately redirects rather than 403s — an admin URL
 * shouldn't confirm it exists to someone who isn't one.
 */
export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();

  if (member.role !== "admin") {
    redirect("/piazza");
  }

  return member;
}
