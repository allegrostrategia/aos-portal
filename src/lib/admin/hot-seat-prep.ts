import "server-only";

import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/onboarding/cadence";

export type PrepSubmission = {
  id: string;
  member_id: string;
  challenge: string | null;
  already_tried: string | null;
  done_looks_like: string | null;
  submitted_at: string | null;
  suggested_challenge: string | null;
  confirmed_challenge: string | null;
  confirmed_at: string | null;
  members: { full_name: string; email: string } | null;
};

export type MemberMonthTime = {
  memberId: string;
  totalMinutes: number;
  byCategory: { label: string; minutes: number }[];
};

/**
 * Everything Nina needs in front of her to prep a session (§5).
 *
 * Admin RLS returns every submission for the session, which is the intent here —
 * unlike the member-facing queries, where relying on that would be the bug it
 * once was.
 */
export async function getSessionSubmissions(
  sessionId: string,
): Promise<PrepSubmission[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("hot_seat_submissions")
    .select(
      "id, member_id, challenge, already_tried, done_looks_like, submitted_at, suggested_challenge, confirmed_challenge, confirmed_at, members(full_name, email)",
    )
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: true, nullsFirst: false });

  return (data ?? []) as unknown as PrepSubmission[];
}

/**
 * Each member's tracked time for the session's month, by category.
 *
 * This is the "automatic, no form needed" half of §5's pre-submission — and the
 * evidence the drafted suggestion is meant to reason from. A member's own words
 * say what they think the problem is; this says where the hours actually went,
 * and the interesting cases are where those two disagree.
 */
export async function getMonthTimeByMember(
  memberIds: string[],
  sessionMonth: string,
): Promise<Map<string, MemberMonthTime>> {
  const result = new Map<string, MemberMonthTime>();
  if (memberIds.length === 0) return result;

  const supabase = await createClient();

  const monthStart = sessionMonth;
  const monthEnd = addDays(
    new Date(
      Date.UTC(
        Number(sessionMonth.slice(0, 4)),
        Number(sessionMonth.slice(5, 7)),
        1,
      ),
    )
      .toISOString()
      .slice(0, 10),
    0,
  );

  const [{ data: entries }, { data: categories }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("member_id, category_slug, duration_minutes")
      .in("member_id", memberIds)
      .gte("started_at", `${monthStart}T00:00:00Z`)
      .lt("started_at", `${monthEnd}T00:00:00Z`)
      .not("ended_at", "is", null),
    supabase.from("time_categories").select("slug, label"),
  ]);

  const labels = new Map(
    ((categories ?? []) as { slug: string; label: string }[]).map((c) => [
      c.slug,
      c.label,
    ]),
  );

  for (const entry of (entries ?? []) as {
    member_id: string;
    category_slug: string;
    duration_minutes: number | null;
  }[]) {
    const minutes = entry.duration_minutes ?? 0;
    const existing = result.get(entry.member_id) ?? {
      memberId: entry.member_id,
      totalMinutes: 0,
      byCategory: [],
    };

    existing.totalMinutes += minutes;

    const label = labels.get(entry.category_slug) ?? entry.category_slug;
    const row = existing.byCategory.find((c) => c.label === label);
    if (row) row.minutes += minutes;
    else existing.byCategory.push({ label, minutes });

    result.set(entry.member_id, existing);
  }

  for (const value of result.values()) {
    value.byCategory.sort((a, b) => b.minutes - a.minutes);
  }

  return result;
}
