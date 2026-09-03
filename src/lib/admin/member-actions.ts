"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type MemberActionState = {
  error?: string;
  notice?: string;
} | null;

/**
 * The member lifecycle moves, driven from the admin panel.
 *
 * Each calls the matching database function rather than updating the row
 * directly, so the rules — who may do it, what state it's valid from, what else
 * has to change — stay in one place and can't be half-applied by a screen that
 * forgot a step.
 *
 * All are Server Actions, which are public endpoints, so each re-checks admin
 * rather than trusting the page that rendered the button.
 */

async function callMemberRpc(
  fn: "activate_member" | "cancel_member" | "rejoin_member",
  args: Record<string, unknown>,
): Promise<MemberActionState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);

  if (error) {
    // Postgres exceptions from these functions are written to be read by a
    // person — "Member x is active — only an onboarding member can be
    // activated" — so pass them through rather than replacing them with
    // something vaguer.
    return { error: error.message };
  }

  revalidatePath("/admin/members");
  revalidatePath("/", "layout");
  return null;
}

/**
 * Onboarding → active. The move that unlocks the full library, hot seat, peer
 * pairing and draw eligibility (§1), made at week 1 of the month after they
 * joined. The most frequent operational action in the product.
 */
export async function activateMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "No member given." };

  const result = await callMemberRpc("activate_member", {
    p_member_id: memberId,
  });

  return result ?? { notice: "Activated. Everything is open to them now." };
}

/** Revokes access. Deletes nothing (§1). */
export async function cancelMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const memberId = String(formData.get("member_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!memberId) return { error: "No member given." };

  const result = await callMemberRpc("cancel_member", {
    p_member_id: memberId,
    p_note: note || null,
  });

  return (
    result ?? {
      notice:
        "Cancelled. Their access is gone; their logs, roadmap and Archivio are untouched.",
    }
  );
}

/** Back to onboarding, from scratch — never straight to active (§1). */
export async function rejoinMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "No member given." };

  const result = await callMemberRpc("rejoin_member", {
    p_member_id: memberId,
  });

  return (
    result ?? {
      notice:
        "Back in onboarding, with a fresh six-month term. Their previous work is still theirs.",
    }
  );
}

/**
 * Mark who the coach is (§9).
 *
 * The odd one out in a month's pairing is paired with the coach, and that has to
 * be a named person rather than whoever happens to run the matching — with more
 * than one admin those are different people, and a member's coach pairing being
 * with a developer account isn't what §9 describes.
 *
 * Clearing the current coach first, in the same breath as setting the new one:
 * the database allows exactly one, so setting a second without clearing the
 * first fails on the unique index rather than doing what was meant.
 */
export async function setCoach(formData: FormData): Promise<void> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  const makeCoach = formData.get("is_coach") === "true";
  if (!memberId) return;

  const supabase = await createClient();

  if (makeCoach) {
    await supabase
      .from("members")
      .update({ is_coach: false })
      .eq("is_coach", true);
  }

  await supabase
    .from("members")
    .update({ is_coach: makeCoach })
    .eq("id", memberId);

  revalidatePath("/", "layout");
}
