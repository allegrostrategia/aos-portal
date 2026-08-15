"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type RoadmapState = {
  error?: string;
  notice?: string;
} | null;

export type RoadmapPhaseInput = {
  title: string;
  stationSlug: string | null;
  items: string[];
};

/**
 * Write a member's roadmap (§3).
 *
 * The roadmap lives as structured data, never as a document or a per-member
 * file. La Strada is one shared template for everyone; this row is what makes it
 * personal on load.
 *
 * Item ids are generated here and kept stable across edits, because
 * `weekly_submissions.actions_taken` keys off them. Re-ordering phases or
 * rewording an item must not detach the ticks a member has already made against
 * it — which is exactly what would happen if the key were the item's text or its
 * position in the list.
 */
export async function saveRoadmap(
  _prev: RoadmapState,
  formData: FormData,
): Promise<RoadmapState> {
  const admin = await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "");
  const currentFocus = String(formData.get("current_focus") ?? "").trim();
  const focusStation = String(formData.get("current_focus_station") ?? "").trim();
  const publish = formData.get("intent") === "publish";
  const raw = String(formData.get("phases") ?? "[]");

  if (!memberId) return { error: "No member given." };

  let phases: RoadmapPhaseInput[];
  try {
    phases = JSON.parse(raw) as RoadmapPhaseInput[];
  } catch {
    return { error: "The phases didn't parse — try again." };
  }

  const cleaned = phases
    .map((phase) => ({
      title: (phase.title ?? "").trim(),
      station_slug: phase.stationSlug || null,
      items: (phase.items ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
    }))
    .filter((phase) => phase.title || phase.items.length > 0);

  if (cleaned.length === 0) {
    return { error: "A roadmap needs at least one phase with something in it." };
  }

  const supabase = await createClient();

  // Reuse ids where an item's text is unchanged, so ticks already made against
  // it survive an edit. New or reworded items get a fresh id.
  const { data: existingRow } = await supabase
    .from("roadmap")
    .select("phases")
    .eq("member_id", memberId)
    .eq("is_current", true)
    .maybeSingle();

  const existingIds = new Map<string, string>();
  for (const phase of (existingRow?.phases ?? []) as {
    items?: { id?: string; label?: string }[];
  }[]) {
    for (const item of phase.items ?? []) {
      if (item.id && item.label) existingIds.set(item.label, item.id);
    }
  }

  const phasesJson = cleaned.map((phase) => ({
    title: phase.title,
    station_slug: phase.station_slug,
    items: phase.items.map((label) => ({
      id: existingIds.get(label) ?? crypto.randomUUID(),
      label,
    })),
  }));

  // Whether this is their first roadmap decides how it's logged in history: the
  // one from the 1:1 is a different event from a monthly re-point (§1).
  const { count } = await supabase
    .from("roadmap")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId);

  const reason = (count ?? 0) === 0 ? "onboarding" : "monthly_repoint";

  // Exactly one current roadmap per member — enforced by a partial unique index,
  // so the old one has to step down before the new one lands.
  await supabase
    .from("roadmap")
    .update({ is_current: false })
    .eq("member_id", memberId)
    .eq("is_current", true);

  const { error } = await supabase.from("roadmap").insert({
    member_id: memberId,
    phases: phasesJson,
    current_focus: currentFocus || null,
    current_focus_station_slug: focusStation || null,
    reason,
    // Written by hand in the admin panel. When Claude drafts these, this becomes
    // 'claude' on the draft and stays 'nina' whenever she edits it.
    drafted_by: "nina",
    is_current: true,
    ...(publish
      ? { confirmed_at: new Date().toISOString(), confirmed_by: admin.id }
      : {}),
  });

  if (error) {
    return { error: `Couldn't save the roadmap: ${error.message}` };
  }

  revalidatePath("/", "layout");

  return {
    notice: publish
      ? "Saved and visible to them."
      : "Saved as a draft — they can't see it until you publish.",
  };
}
