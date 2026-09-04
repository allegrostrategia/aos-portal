import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readRoadmap, type RoadmapMonth } from "./shape";

export type MemberRoadmap = {
  id: string;
  months: RoadmapMonth[];
  currentFocus: string | null;
  currentFocusStationSlug: string | null;
  confirmedAt: string | null;
  reason: string;
};

/** The member's live roadmap, in the current shape whatever's stored. */
export async function getCurrentRoadmap(
  memberId: string,
): Promise<MemberRoadmap | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roadmap")
    .select("id, phases, current_focus, current_focus_station_slug, confirmed_at, reason")
    .eq("member_id", memberId)
    .eq("is_current", true)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    id: string;
    phases: unknown;
    current_focus: string | null;
    current_focus_station_slug: string | null;
    confirmed_at: string | null;
    reason: string;
  };

  return {
    id: row.id,
    months: readRoadmap(row.phases),
    currentFocus: row.current_focus,
    currentFocusStationSlug: row.current_focus_station_slug,
    confirmedAt: row.confirmed_at,
    reason: row.reason,
  };
}

/**
 * What the member has said about each action.
 *
 * Keyed by action id so the editor and the member's own view can both look a
 * note up beside the action it belongs to, rather than as a separate list
 * nobody reads.
 */
export async function getActionNotes(
  roadmapId: string,
): Promise<Map<string, string>> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roadmap_action_notes")
    .select("action_id, body")
    .eq("roadmap_id", roadmapId);

  return new Map(
    ((data ?? []) as { action_id: string; body: string }[]).map((n) => [
      n.action_id,
      n.body,
    ]),
  );
}

export type TrainingOption = { id: string; title: string; stationSlug: string };

/** Published trainings, for the per-action picker. */
export async function getTrainingOptions(): Promise<TrainingOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("training_content")
    .select("id, title, station_slug")
    .not("published_at", "is", null)
    .order("station_slug")
    .order("title");

  return ((data ?? []) as { id: string; title: string; station_slug: string }[]).map(
    (t) => ({ id: t.id, title: t.title, stationSlug: t.station_slug }),
  );
}
