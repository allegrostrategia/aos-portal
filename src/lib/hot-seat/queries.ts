import "server-only";

import { createClient } from "@/lib/supabase/server";
import { pickUpcomingSession } from "./upcoming";

export type HotSeatSession = {
  id: string;
  session_month: string;
  scheduled_for: string | null;
  zoom_url: string | null;
};

export type HotSeatSubmission = {
  id: string;
  session_id: string;
  member_id: string;
  challenge: string | null;
  already_tried: string | null;
  done_looks_like: string | null;
  submitted_at: string | null;
  suggested_challenge: string | null;
  confirmed_challenge: string | null;
  confirmed_at: string | null;
};

/**
 * The session a member is heading towards.
 *
 * Fetches the candidates and lets `pickUpcomingSession` decide, rather than
 * encoding the choice in a WHERE clause. The first version did the latter and
 * got it wrong invisibly — see the note in upcoming.ts.
 */
export async function getUpcomingSession(): Promise<HotSeatSession | null> {
  const supabase = await createClient();

  // From the start of last month, so a session still within its grace window is
  // among the candidates. The choosing is done in one tested place.
  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  )
    .toISOString()
    .slice(0, 10);

  const { data } = await supabase
    .from("hot_seat_sessions")
    .select("id, session_month, scheduled_for, zoom_url")
    .gte("session_month", from)
    .order("session_month");

  return pickUpcomingSession((data ?? []) as HotSeatSession[], now);
}

export async function getMySubmission(
  memberId: string,
  sessionId: string,
): Promise<HotSeatSubmission | null> {
  const supabase = await createClient();

  const { data} = await supabase
    .from("hot_seat_submissions")
    .select("*")
    .eq("member_id", memberId)
    .eq("session_id", sessionId)
    .maybeSingle();

  return (data as HotSeatSubmission | null) ?? null;
}

/** Their most recent confirmed build — what Piazza shows as the current challenge. */
export async function getCurrentChallenge(
  memberId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("hot_seat_submissions")
    .select("confirmed_challenge")
    .eq("member_id", memberId)
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { confirmed_challenge: string | null } | null)?.confirmed_challenge ?? null;
}
