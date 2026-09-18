import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ACTION_BUCKETS, readRoadmap, type ActionBucket, type RoadmapMonth } from "./shape";

export type MemberRoadmap = {
  id: string;
  months: RoadmapMonth[];
  currentFocus: string | null;
  currentFocusStationSlug: string | null;
  confirmedAt: string | null;
  reason: string;
  /** First Monday of month 1 (La Strada). Null on older roadmaps. */
  startsOn: string | null;
};

/** The member's live roadmap, in the current shape whatever's stored. */
export async function getCurrentRoadmap(
  memberId: string,
): Promise<MemberRoadmap | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roadmap")
    .select("id, phases, current_focus, current_focus_station_slug, confirmed_at, reason, starts_on")
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
    starts_on: string | null;
  };

  return {
    id: row.id,
    months: readRoadmap(row.phases),
    currentFocus: row.current_focus,
    currentFocusStationSlug: row.current_focus_station_slug,
    confirmedAt: row.confirmed_at,
    reason: row.reason,
    startsOn: row.starts_on,
  };
}

/**
 * What La Strada needs beside the structure (brief, 18 Sep): the ticks, the
 * weekly log's ticks (any week), and the off-the-itinerary notes.
 *
 * Done, for an action, is: an explicit tick on La Strada if there is one;
 * otherwise "ticked in some week's log"; otherwise no. The log answers
 * "did you do it this week" per signed-off week and locks the week; La
 * Strada answers "is it done" about the action, from any week.
 */
export async function getStradaState(roadmapId: string, memberId: string): Promise<{
  ticks: Map<string, boolean>;
  loggedDone: Set<string>;
  notes: Map<number, string>;
}> {
  const supabase = await createClient();
  const [{ data: tickRows }, { data: weekRows }, { data: noteRows }] = await Promise.all([
    supabase.from("roadmap_action_ticks").select("action_id, done").eq("roadmap_id", roadmapId),
    supabase.from("weekly_submissions").select("actions_taken").eq("member_id", memberId),
    supabase.from("roadmap_month_notes").select("month, body").eq("roadmap_id", roadmapId),
  ]);

  const ticks = new Map(((tickRows ?? []) as { action_id: string; done: boolean }[]).map((t) => [t.action_id, t.done]));
  const loggedDone = new Set<string>();
  for (const row of (weekRows ?? []) as { actions_taken: Record<string, boolean> | null }[]) {
    for (const [id, on] of Object.entries(row.actions_taken ?? {})) if (on) loggedDone.add(id);
  }
  const notes = new Map(((noteRows ?? []) as { month: number; body: string }[]).map((n) => [n.month, n.body]));
  return { ticks, loggedDone, notes };
}

export function isDone(actionId: string, state: { ticks: Map<string, boolean>; loggedDone: Set<string> }): boolean {
  const explicit = state.ticks.get(actionId);
  if (explicit !== undefined) return explicit;
  return state.loggedDone.has(actionId);
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

export type TrainingOption = {
  id: string;
  title: string;
  stationSlug: string;
  stationName: string;
  bucket: ActionBucket | null;
};

/** Published trainings, for the per-action picker and the link chip. */
export async function getTrainingOptions(): Promise<TrainingOption[]> {
  const supabase = await createClient();

  const [{ data }, { data: stationRows }] = await Promise.all([
    supabase
      .from("training_content")
      .select("id, title, station_slug, bucket")
      .not("published_at", "is", null)
      .order("station_slug")
      .order("title"),
    supabase.from("stations").select("slug, name"),
  ]);
  const stationName = new Map(((stationRows ?? []) as { slug: string; name: string }[]).map((s) => [s.slug, s.name]));

  return ((data ?? []) as { id: string; title: string; station_slug: string; bucket: string | null }[]).map(
    (t) => ({
      id: t.id,
      title: t.title,
      stationSlug: t.station_slug,
      stationName: stationName.get(t.station_slug) ?? t.station_slug,
      bucket: (ACTION_BUCKETS as readonly string[]).includes(t.bucket ?? "") ? (t.bucket as ActionBucket) : null,
    }),
  );
}
