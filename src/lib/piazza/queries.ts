import "server-only";

import { createClient } from "@/lib/supabase/server";

export type FocusStation = {
  slug: string;
  name: string;
  description: string | null;
};

export type PiazzaRoadmap = {
  currentFocus: string | null;
  focusStation: FocusStation | null;
  phaseTitle: string | null;
  openItems: string[];
};

/**
 * The member's roadmap, as Piazza needs it.
 *
 * "Continue your journey" is a deep link into the station matching their current
 * focus, not a link to the map (§3) — so the station comes back whole rather than
 * as a slug the page would have to resolve itself.
 *
 * Only a confirmed roadmap counts. A draft is Nina's working material.
 */
export async function getPiazzaRoadmap(
  memberId: string,
): Promise<PiazzaRoadmap | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roadmap")
    .select("phases, current_focus, current_focus_station_slug")
    .eq("member_id", memberId)
    .eq("is_current", true)
    .not("confirmed_at", "is", null)
    .maybeSingle();

  if (!data) return null;

  const row = data as {
    phases: {
      title?: string;
      station_slug?: string | null;
      items?: { id?: string; label?: string }[];
    }[];
    current_focus: string | null;
    current_focus_station_slug: string | null;
  };

  let focusStation: FocusStation | null = null;
  if (row.current_focus_station_slug) {
    const { data: station } = await supabase
      .from("stations")
      .select("slug, name, description")
      .eq("slug", row.current_focus_station_slug)
      .maybeSingle();
    focusStation = (station as FocusStation | null) ?? null;
  }

  // The first phase with anything in it — what they're working through now.
  const phase = (row.phases ?? []).find((p) => (p.items ?? []).length > 0);

  return {
    currentFocus: row.current_focus,
    focusStation,
    phaseTitle: phase?.title ?? null,
    openItems: (phase?.items ?? [])
      .map((item) => item.label ?? "")
      .filter(Boolean),
  };
}
