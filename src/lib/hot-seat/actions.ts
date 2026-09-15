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
 * the ask to something buildable in the time available, which is the
 * difference between a build and a conversation.
 *
 * Round 3 adds the reflection beside the three: what their own log says has
 * been eating the month and what they'd streamline, or "not sure yet", which
 * is a flag rather than words so Nina sees it as the answer it is.
 */
export async function saveSubmission(
  _prev: HotSeatState,
  formData: FormData,
): Promise<HotSeatState> {
  const member = await requireMember();

  if (member.status !== "active") {
    return {
      error:
        "The hot seat opens once you're active. It's built around a live challenge, which comes out of your first roadmap.",
    };
  }

  const sessionId = String(formData.get("session_id") ?? "");
  const challenge = String(formData.get("challenge") ?? "").trim();
  const alreadyTried = String(formData.get("already_tried") ?? "").trim();
  const doneLooksLike = String(formData.get("done_looks_like") ?? "").trim();
  const reflection = String(formData.get("reflection") ?? "").trim();
  const reflectionUnsure = formData.get("reflection_unsure") === "on";

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
        "Nina has already prepped this one, so it's locked. Mention any change on the call. That's quicker than rewriting it here.",
    };
  }

  const payload = {
    challenge,
    already_tried: alreadyTried || null,
    done_looks_like: doneLooksLike || null,
    reflection: reflection || null,
    reflection_unsure: reflectionUnsure,
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

/**
 * Reply on the thread (round 3, §B). The member's side of the back-and-forth
 * with Nina before the call. RLS holds the rules: own submission, as
 * themselves, while the challenge is unconfirmed. Nothing is pushed to Nina;
 * the prep sheet is where she reads it.
 */
export async function replyOnSubmission(
  _prev: HotSeatState,
  formData: FormData,
): Promise<HotSeatState> {
  const member = await requireMember();
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!submissionId) return { error: "No submission to reply on." };
  if (!body) return { error: "Say something first." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hot_seat_comments")
    .insert({ submission_id: submissionId, member_id: member.id, body });

  if (error) {
    return {
      error: error.message.includes("row-level security")
        ? "This thread is closed. Nina has confirmed the build, so anything more is for the call."
        : `Couldn't send that: ${error.message}`,
    };
  }

  revalidatePath("/hot-seat");
  revalidatePath("/piazza");
  return null;
}

/**
 * The member has the thread in front of them. Called from the page render
 * of their own submission, which is what makes the Piazza flag clear.
 */
export async function markCommentsSeen(submissionId: string): Promise<void> {
  const member = await requireMember();
  if (!submissionId) return;
  const supabase = await createClient();
  await supabase
    .from("hot_seat_submissions")
    .update({ comments_seen_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("member_id", member.id);
}
