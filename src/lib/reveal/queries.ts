import "server-only";

import { createClient } from "@/lib/supabase/server";
import { EMPTY_REVEAL, readPriorities, type Reveal } from "./shape";

/**
 * A member's reveal document, if one has been written.
 *
 * Admin-only by RLS — there is no member-facing read, by design: §1 hands this
 * over before they have a portal at all, and La Strada is the live version
 * afterwards.
 */
export async function getReveal(memberId: string): Promise<Reveal | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roadmap_reveals")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();

  if (!data) return null;
  const row = data as Record<string, unknown>;

  const text = (key: string) =>
    typeof row[key] === "string" ? (row[key] as string) : "";

  return {
    ...EMPTY_REVEAL,
    preparedOn: text("prepared_on"),
    baseline: text("baseline"),
    startsOn: text("starts_on"),
    inTheirWords: text("in_their_words"),
    whatsWorking: text("whats_working"),
    whatsNotWorking: text("whats_not_working"),
    priorities: readPriorities(row.priorities),
    roadNote: text("road_note"),
  };
}
