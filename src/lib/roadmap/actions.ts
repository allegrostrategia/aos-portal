"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type RoadmapState = { error?: string; notice?: string } | null;

/**
 * The member's note about one action.
 *
 * Edited in place rather than appended to: somebody coming back to say "actually
 * it's working now" is updating what they said, not leaving two contradictory
 * notes for Nina to reconcile.
 */
export async function saveActionNote(
  _prev: RoadmapState,
  formData: FormData,
): Promise<RoadmapState> {
  const member = await requireMember();

  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const actionId = String(formData.get("action_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!roadmapId || !actionId) return { error: "Which action?" };

  const supabase = await createClient();

  if (!body) {
    // Clearing it is a real intent — a note written in frustration and thought
    // better of shouldn't need Nina to remove.
    await supabase
      .from("roadmap_action_notes")
      .delete()
      .eq("roadmap_id", roadmapId)
      .eq("action_id", actionId)
      .eq("member_id", member.id);

    revalidatePath("/log");
    return { notice: "Cleared." };
  }

  const { error } = await supabase.from("roadmap_action_notes").upsert(
    { member_id: member.id, roadmap_id: roadmapId, action_id: actionId, body },
    { onConflict: "roadmap_id,action_id" },
  );

  if (error) return { error: `Couldn't save that: ${error.message}` };

  revalidatePath("/log");
  return { notice: "Saved." };
}
