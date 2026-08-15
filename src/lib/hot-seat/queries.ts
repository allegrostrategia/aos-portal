import "server-only";

import { createClient } from "@/lib/supabase/server";
import { firstMondayOfMonth } from "@/lib/onboarding/cadence";

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
 * The hot seat is week 1 of every month (§1), so "the next one" is this month's
 * if it hasn't happened, otherwise next month's. Looked up by month rather than
 * by `scheduled_for`, because the exact slot may not be set yet and a session
 * without a time is still the session everyone is preparing for.
 */
export async function getUpcomingSession(): Promise<HotSeatSession | null> {
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = `${today.slice(0, 7)}-01`;

  // If this month's hot seat week has already passed, look to next month.
  const hotSeatWeek = firstMondayOfMonth(today);
  const fromMonth =
    today > hotSeatWeek
      ? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1))
          .toISOString()
          .slice(0, 10)
      : thisMonth;

  const { data } = await supabase
    .from("hot_seat_sessions")
    .select("id, session_month, scheduled_for, zoom_url")
    .gte("session_month", fromMonth)
    .order("session_month")
    .limit(1)
    .maybeSingle();

  return (data as HotSeatSession | null) ?? null;
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
