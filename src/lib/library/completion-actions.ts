"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

/**
 * Mark a lesson complete, or take the tick back.
 *
 * L'Editoriale §2: persisted per member per lesson, so it survives a refresh.
 * The member's own session does the write — RLS decides whether the lesson is
 * theirs to tick (published, visible at their tier) and whether they still
 * have access. A cancelled member's tick is refused by the policy rather than
 * by code here, which is the one gate cancellation works through.
 */
export async function setLessonComplete(
  contentId: string,
  complete: boolean,
  stationSlug: string,
  contentSlug: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, message: "Not signed in." };

  const supabase = await createClient();

  const { error } = complete
    ? await supabase
        .from("lesson_completions")
        .upsert(
          { member_id: member.id, content_id: contentId },
          { onConflict: "member_id,content_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("lesson_completions")
        .delete()
        .eq("member_id", member.id)
        .eq("content_id", contentId);

  if (error) {
    // The policy refusing is the expected shape for a lesson they can't see.
    return { ok: false, message: "That couldn't be saved. Try again in a moment." };
  }

  revalidatePath(`/library/${contentSlug}`);
  revalidatePath(`/stations/${stationSlug}`);
  return { ok: true };
}
