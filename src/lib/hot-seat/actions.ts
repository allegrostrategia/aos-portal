"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type HotSeatState = { error?: string; notice?: string } | null;

/**
 * Pre-submit for the hot seat (§5).
 *
 * Three questions only. Their tracked time for the month is pulled at prep time
 * and needs no form, and their handover pack and roadmap position are read then
 * too — so nothing here asks a member for something the product already knows.
 *
 * "What would 'done' look like?" is the one that does the real work: it scopes
 * the ask to something buildable in the time available, which at five minutes a
 * head is the difference between a build and a conversation.
 */
export async function saveSubmission(
  _prev: HotSeatState,
  formData: FormData,
): Promise<HotSeatState> {
  const member = await requireMember();

  if (member.status !== "active") {
    return {
      error:
        "The hot seat opens once you're active — it's built around a live challenge, which comes out of your first roadmap.",
    };
  }

  const sessionId = String(formData.get("session_id") ?? "");
  const challenge = String(formData.get("challenge") ?? "").trim();
  const alreadyTried = String(formData.get("already_tried") ?? "").trim();
  const doneLooksLike = String(formData.get("done_looks_like") ?? "").trim();

  if (!sessionId) return { error: "No session to submit against." };
  if (!challenge) {
    return { error: "Say what you're stuck on, in your own words." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("hot_seat_submissions")
    .select("id, confirmed_at")
    .eq("member_id", member.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  const row = existing as { id: string; confirmed_at: string | null } | null;

  if (row?.confirmed_at) {
    return {
      error:
        "Nina has already prepped this one, so it's locked. Mention any change on the call — that's quicker than rewriting it here.",
    };
  }

  const payload = {
    challenge,
    already_tried: alreadyTried || null,
    done_looks_like: doneLooksLike || null,
    submitted_at: new Date().toISOString(),
  };

  const { error } = row
    ? await supabase.from("hot_seat_submissions").update(payload).eq("id", row.id)
    : await supabase.from("hot_seat_submissions").insert({
        member_id: member.id,
        session_id: sessionId,
        ...payload,
      });

  if (error) {
    return { error: `Couldn't save that: ${error.message}` };
  }

  revalidatePath("/hot-seat");
  return { notice: "In. You can keep editing until Nina preps the session." };
}
