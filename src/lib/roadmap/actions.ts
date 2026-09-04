"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { readRoadmap, type RoadmapMonth } from "./shape";

export type RoadmapState = { error?: string; notice?: string } | null;

/**
 * Save a member's roadmap (§3, and the 3 Sep structure).
 *
 * Nina works the plan out with Claude outside the product and types the result
 * here. Nothing drafts anything: this is the whole mechanism, not the confirm
 * step after one.
 *
 * **Action ids are preserved wherever an action's wording is unchanged.**
 * `weekly_submissions.actions_taken` and `roadmap_action_notes` both key off
 * them, so re-ordering a month or renaming a focus must not detach a member's
 * ticks or separate them from what they wrote about an action. A reworded action
 * is a new action and gets a new id, which is the honest answer — the thing they
 * ticked is not the thing that's there now.
 */
export async function saveRoadmapStructure(
  _prev: RoadmapState,
  formData: FormData,
): Promise<RoadmapState> {
  const admin = await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  const publish = formData.get("intent") === "publish";
  const raw = String(formData.get("months") ?? "[]");

  if (!memberId) return { error: "No member given." };

  let incoming: RoadmapMonth[];
  try {
    incoming = readRoadmap(JSON.parse(raw));
  } catch {
    return { error: "That didn't parse — try again." };
  }

  if (incoming.length === 0) {
    return { error: "A roadmap needs at least one month with something in it." };
  }

  const supabase = await createClient();

  const { data: existingRow } = await supabase
    .from("roadmap")
    .select("id, phases, reason")
    .eq("member_id", memberId)
    .eq("is_current", true)
    .maybeSingle();

  const existing = existingRow as
    | { id: string; phases: unknown; reason: string }
    | null;

  // Wording → id, from what's already stored. Matching on the text is what makes
  // "the same action, moved to a different week" keep its history.
  const idByLabel = new Map<string, string>();
  for (const month of readRoadmap(existing?.phases)) {
    for (const focus of month.focuses) {
      for (const action of focus.actions) {
        if (!idByLabel.has(action.label)) idByLabel.set(action.label, action.id);
      }
    }
  }

  const phases = incoming.map((month, monthIndex) => ({
    month: monthIndex + 1,
    title: month.title,
    focuses: month.focuses.map((focus, focusIndex) => ({
      id: focus.id || `f-${monthIndex}-${focusIndex}-${crypto.randomUUID().slice(0, 8)}`,
      title: focus.title,
      station_slug: focus.stationSlug,
      actions: focus.actions.map((action) => ({
        id: idByLabel.get(action.label) ?? crypto.randomUUID(),
        label: action.label,
        training_id: action.trainingId,
        week: action.week,
      })),
    })),
  }));

  const fields = {
    phases,
    // Nothing in the product drafts a roadmap, so this is simply true.
    drafted_by: "nina" as const,
    ...(publish
      ? { confirmed_at: new Date().toISOString(), confirmed_by: admin.id }
      : {}),
  };

  if (existing) {
    const { error } = await supabase
      .from("roadmap")
      .update(fields)
      .eq("id", existing.id);

    if (error) return { error: `Couldn't save that: ${error.message}` };
  } else {
    const { error } = await supabase.from("roadmap").insert({
      member_id: memberId,
      reason: "onboarding",
      is_current: true,
      ...fields,
    });

    if (error) return { error: `Couldn't save that: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return {
    notice: publish
      ? "Published. It's on their La Strada and in their weekly log."
      : "Saved as a draft — they can't see it until it's published.",
  };
}

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
