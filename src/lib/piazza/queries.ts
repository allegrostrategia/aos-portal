import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readRoadmap } from "@/lib/roadmap/shape";

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
    phases: unknown;
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

  // The first month with anything in it — what they're working through now.
  // `readRoadmap` normalises the legacy phase shape, so a roadmap written before
  // 3 Sep still reads here without being migrated.
  const months = readRoadmap(row.phases);
  const month = months.find((m) =>
    m.focuses.some((f) => f.actions.length > 0),
  );

  const focusWithActions = month?.focuses.find((f) => f.actions.length > 0);

  return {
    currentFocus: row.current_focus,
    focusStation,
    // The month's own title where it has one, falling back to the focus — a
    // legacy phase carried its title on the focus, and Piazza should read the
    // same either way.
    phaseTitle: month?.title || focusWithActions?.title || null,
    openItems: (month?.focuses ?? []).flatMap((focus) =>
      focus.actions.map((action) => action.label),
    ),
  };
}
