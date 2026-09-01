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
  attended: boolean | null;
  members: { full_name: string; email: string } | null;
};

/**
 * One row of the prep sheet: a member, and their submission if they made one.
 *
 * Everyone who could be in the room, not everyone who filled in the form. §5's
 * fallback — "if nobody submits, work from whatever their tracked data shows as
 * the biggest time-block" — is impossible to act on otherwise, because a member
 * who never submits has no row to prep against.
 */
export type PrepRow = {
  memberId: string;
  fullName: string;
  email: string;
  submissionId: string | null;
  challenge: string | null;
  alreadyTried: string | null;
  doneLooksLike: string | null;
  submittedAt: string | null;
  suggestedChallenge: string | null;
  confirmedChallenge: string | null;
  confirmedAt: string | null;
  attended: boolean | null;
  /** Cancelled since the session, but their record of it stands. */
  stillActive: boolean;
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
      "id, member_id, challenge, already_tried, done_looks_like, submitted_at, suggested_challenge, confirmed_challenge, confirmed_at, attended, members(full_name, email)",
    )
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: true, nullsFirst: false });

  return (data ?? []) as unknown as PrepSubmission[];
}

/**
 * The prep sheet: every active member, with their submission if there is one.
 *
 * Built from two queries and merged here rather than a join, because the shape
 * wanted is "all members, some with submissions" and PostgREST embeds the other
 * way round. Anyone who submitted and has since been cancelled is kept — they
 * were in that session, and cancellation never removes a record (rule 6).
 */
export async function getSessionPrep(sessionId: string): Promise<PrepRow[]> {
  const supabase = await createClient();

  const [{ data: memberRows }, submissions] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name, email")
      .eq("role", "member")
      .eq("status", "active")
      .order("full_name"),
    getSessionSubmissions(sessionId),
  ]);

  const byMember = new Map(submissions.map((s) => [s.member_id, s]));
  const active = (memberRows ?? []) as {
    id: string;
    full_name: string;
    email: string;
  }[];

  const toRow = (
    memberId: string,
    fullName: string,
    email: string,
    stillActive: boolean,
  ): PrepRow => {
    const submission = byMember.get(memberId);
    return {
      memberId,
      fullName,
      email,
      submissionId: submission?.id ?? null,
      challenge: submission?.challenge ?? null,
      alreadyTried: submission?.already_tried ?? null,
      doneLooksLike: submission?.done_looks_like ?? null,
      submittedAt: submission?.submitted_at ?? null,
      suggestedChallenge: submission?.suggested_challenge ?? null,
      confirmedChallenge: submission?.confirmed_challenge ?? null,
      confirmedAt: submission?.confirmed_at ?? null,
      attended: submission?.attended ?? null,
      stillActive,
    };
  };

  const rows = active.map((m) => toRow(m.id, m.full_name, m.email, true));

  const activeIds = new Set(active.map((m) => m.id));
  for (const submission of submissions) {
    if (activeIds.has(submission.member_id)) continue;
    rows.push(
      toRow(
        submission.member_id,
        submission.members?.full_name ?? "Former member",
        submission.members?.email ?? "",
        false,
      ),
    );
  }

  // Whoever did the work first, then the rest by name. Nina prepping in order
  // reads the considered answers while she's freshest.
  return rows.sort((a, b) => {
    if (Boolean(a.submittedAt) !== Boolean(b.submittedAt)) {
      return a.submittedAt ? -1 : 1;
    }
    if (a.submittedAt && b.submittedAt) {
      return a.submittedAt.localeCompare(b.submittedAt);
    }
    return a.fullName.localeCompare(b.fullName);
  });
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
