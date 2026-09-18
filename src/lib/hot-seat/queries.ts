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
  time_sink: string | null;
  should_stop: string | null;
  reflection: string | null;
  reflection_unsure: boolean;
  submitted_at: string | null;
  suggested_challenge: string | null;
  confirmed_challenge: string | null;
  confirmed_at: string | null;
  comments_seen_at: string | null;
};

export type HotSeatComment = {
  id: string;
  submission_id: string;
  member_id: string;
  body: string;
  created_at: string;
  /** Nina's, as opposed to the member's. From the coach set, not the name. */
  fromCoach: boolean;
};

/**
 * The thread on a submission, oldest first (round 3, §B). RLS scopes it: a
 * member gets their own submission's thread, an admin gets any. "From Nina"
 * is decided by `coach_member_ids()`, the same way chat labels her.
 */
export async function getComments(submissionIds: string[]): Promise<Map<string, HotSeatComment[]>> {
  const threads = new Map<string, HotSeatComment[]>();
  if (submissionIds.length === 0) return threads;
  const supabase = await createClient();

  const [{ data: rows }, { data: coachRows }] = await Promise.all([
    supabase
      .from("hot_seat_comments")
      .select("id, submission_id, member_id, body, created_at")
      .in("submission_id", submissionIds)
      .order("created_at"),
    supabase.rpc("coach_member_ids"),
  ]);
  const coaches = new Set((Array.isArray(coachRows) ? coachRows : []) as string[]);

  for (const row of (rows ?? []) as Omit<HotSeatComment, "fromCoach">[]) {
    const list = threads.get(row.submission_id) ?? [];
    list.push({ ...row, fromCoach: coaches.has(row.member_id) });
    threads.set(row.submission_id, list);
  }
  return threads;
}

/**
 * Whether Nina has left a comment the member hasn't opened yet: the Piazza
 * flag (round 3, §B). An admin's comment newer than `comments_seen_at`.
 */
export function hasUnseenCoachComment(
  submission: Pick<HotSeatSubmission, "comments_seen_at"> | null,
  thread: HotSeatComment[],
): boolean {
  if (!submission) return false;
  // Compared as instants, not strings: the two columns arrive in the same
  // format from PostgREST, but not necessarily from every client.
  const seen = submission.comments_seen_at ? new Date(submission.comments_seen_at).getTime() : 0;
  return thread.some((c) => c.fromCoach && new Date(c.created_at).getTime() > seen);
}

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

/**
 * How many sessions are scheduled from now on — the third number in Piazza's
 * metrics strip. Counts sessions with a time set that hasn't passed; a session
 * row for a month with no time yet isn't "upcoming" in any sense a member
 * could act on.
 */
export async function countUpcomingSessions(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("hot_seat_sessions")
    .select("id", { count: "exact", head: true })
    .gte("scheduled_for", new Date().toISOString());
  return count ?? 0;
}

/**
 * Every session this member has a submission for, newest first, with the
 * session beside it (round 4, item 10). The month picker on the hot seat
 * page is built from this: the upcoming session, plus each month they took
 * part in.
 */
export async function getMyHotSeatHistory(
  memberId: string,
): Promise<{ session: HotSeatSession; submission: HotSeatSubmission }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hot_seat_submissions")
    .select("*, hot_seat_sessions(id, session_month, scheduled_for, zoom_url)")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as (HotSeatSubmission & { hot_seat_sessions: HotSeatSession | null })[];
  return rows
    .filter((r) => r.hot_seat_sessions)
    .map(({ hot_seat_sessions, ...submission }) => ({ session: hot_seat_sessions!, submission }))
    .sort((a, b) => b.session.session_month.localeCompare(a.session.session_month));
}
