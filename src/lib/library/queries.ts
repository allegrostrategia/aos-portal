import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ContentKind = "training" | "replay" | "audio_drop";
export type ContentFormat = "video" | "pdf" | "audio" | "spreadsheet";
export type ContentJob = "save_time" | "make_money";

export type TrainingContent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  station_slug: string;
  bucket: string | null;
  sub_category: string | null;
  job: ContentJob | null;
  kind: ContentKind;
  format: ContentFormat;
  asset_path: string | null;
  duration_minutes: number | null;
  is_hot_seat_buildable: boolean;
  available_during_onboarding: boolean;
  published_at: string | null;
  sort_order: number;
};

/**
 * A station's content.
 *
 * RLS does the access tiering: an onboarding member sees only the starter set
 * and trailer replays, an active member sees everything published (§1, §6). No
 * status branching here — the policy already expresses it, and expressing it
 * twice is how the two versions drift apart.
 */
export async function getStationContent(
  stationSlug: string,
): Promise<TrainingContent[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("training_content")
    .select("*")
    .eq("station_slug", stationSlug)
    .order("sort_order")
    .order("title");

  return (data ?? []) as TrainingContent[];
}

/** Everything, for the admin panel — published or not. */
export async function getAllContent(): Promise<TrainingContent[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("training_content")
    .select("*")
    .order("station_slug")
    .order("sort_order")
    .order("title");

  return (data ?? []) as TrainingContent[];
}

export const KIND_LABEL: Record<ContentKind, string> = {
  training: "Training",
  replay: "Hot seat replay",
  audio_drop: "Audio drop",
};

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  video: "Video",
  pdf: "PDF",
  audio: "Audio",
  spreadsheet: "Spreadsheet",
};

export const JOB_LABEL: Record<ContentJob, string> = {
  save_time: "Saves time",
  make_money: "Makes money",
};
