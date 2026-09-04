import "server-only";

import { createClient } from "@/lib/supabase/server";

export type LedgerWeek = {
  week_start_date: string;
  hours: number;
  breakdown: { handover_pack_id: string; title: string; hours_per_week: number }[];
};

export type MemberHours = {
  total: number;
  weeks: LedgerWeek[];
  /** Sum of the rates currently running — what a qualifying week is worth now. */
  weeklyRate: number;
};

/**
 * A member's hours reclaimed (§2).
 *
 * Summed from the ledger rather than recalculated from today's rates. That
 * distinction is the whole design: a build retired last month stays in every
 * week it actually earned, so the headline number only ever goes up.
 *
 * RLS scopes both reads to the member. The explicit `member_id` filter is here
 * anyway — relying on the policy alone is the bug this codebase already made
 * once, across eight queries.
 */
export async function getMemberHours(memberId: string): Promise<MemberHours> {
  const supabase = await createClient();

  const [{ data: ledger }, { data: rates }] = await Promise.all([
    supabase
      .from("hours_ledger")
      .select("week_start_date, hours, breakdown")
      .eq("member_id", memberId)
      .order("week_start_date", { ascending: false }),
    supabase
      .from("handover_pack_rates")
      .select("hours_per_week, handover_pack!inner(member_id)")
      .is("effective_until", null),
  ]);

  const weeks = ((ledger ?? []) as { week_start_date: string; hours: string | number; breakdown: LedgerWeek["breakdown"] }[]).map(
    (row) => ({
      week_start_date: row.week_start_date,
      // numeric arrives as a string over PostgREST; adding those concatenates.
      hours: Number(row.hours),
      breakdown: row.breakdown ?? [],
    }),
  );

  const weeklyRate = ((rates ?? []) as { hours_per_week: string | number }[]).reduce(
    (sum, row) => sum + Number(row.hours_per_week),
    0,
  );

  return {
    total: weeks.reduce((sum, week) => sum + week.hours, 0),
    weeks,
    weeklyRate,
  };
}

/**
 * What every member has reclaimed between them — §2's collective goal.
 *
 * Deliberately no target attached. §2 asks for the community number beside the
 * personal one but never says what it's counting towards, and inventing a
 * threshold would put a made-up number in front of members as if it meant
 * something. The total is true on its own; the goal needs Nina.
 */
export async function getCommunityHours(): Promise<number> {
  const supabase = await createClient();

  // Members can only see their own ledger rows, so this is an admin-only total
  // until §2's goal is defined and it's clear what members should see.
  const { data } = await supabase.from("hours_ledger").select("hours");

  return ((data ?? []) as { hours: string | number }[]).reduce(
    (sum, row) => sum + Number(row.hours),
    0,
  );
}

export type BuildRate = {
  id: string;
  hours_per_week: number;
  effective_from: string;
  effective_until: string | null;
  note: string | null;
};

export type MemberBuild = {
  id: string;
  title: string;
  body: string | null;
  confirmed_at: string | null;
  created_at: string;
  rates: BuildRate[];
  /** The period still running, if any. Null means retired or never rated. */
  current: BuildRate | null;
};

/**
 * A member's builds and what each has been worth over time — admin only.
 *
 * Every period, not just the current one: the history is the point. "5 hrs since
 * March, 3 since July, retired in October" is the answer to why a member's
 * weekly accrual changed, and a single mutable rate could never give it.
 */
export async function getMemberBuilds(memberId: string): Promise<MemberBuild[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("handover_pack")
    .select(
      "id, title, body, confirmed_at, created_at, handover_pack_rates(id, hours_per_week, effective_from, effective_until, note)",
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    body: string | null;
    confirmed_at: string | null;
    created_at: string;
    handover_pack_rates: (Omit<BuildRate, "hours_per_week"> & {
      hours_per_week: string | number;
    })[];
  }[]).map((build) => {
    const rates = (build.handover_pack_rates ?? [])
      .map((rate) => ({ ...rate, hours_per_week: Number(rate.hours_per_week) }))
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

    return {
      id: build.id,
      title: build.title,
      body: build.body,
      confirmed_at: build.confirmed_at,
      created_at: build.created_at,
      rates,
      current: rates.find((r) => r.effective_until === null) ?? null,
    };
  });
}

export type CheckInResponse = {
  id: string;
  body: string | null;
  voice_path: string | null;
  created_at: string;
  testimonial_consent: boolean;
};

/**
 * What a member has said about their builds (§2's two-week check-in).
 *
 * The evidence half of "retiring needs evidence, not silence". Retiring a rate
 * without it is a guess about somebody else's business, and this is the only
 * place that guess can be replaced with what they actually said.
 *
 * Read under the admin's own RLS: check-ins are posted in their conversation
 * with the coach, so Nina sees them as a participant rather than through any
 * special access. An admin who isn't in that conversation sees nothing, which is
 * correct — it isn't addressed to them.
 */
export async function getCheckInsByBuild(
  buildIds: string[],
): Promise<Map<string, CheckInResponse[]>> {
  const byBuild = new Map<string, CheckInResponse[]>();
  if (buildIds.length === 0) return byBuild;

  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, body, voice_path, created_at, testimonial_consent, handover_pack_id")
    .in("handover_pack_id", buildIds)
    .order("created_at", { ascending: false });

  for (const row of (data ?? []) as (CheckInResponse & {
    handover_pack_id: string;
  })[]) {
    const existing = byBuild.get(row.handover_pack_id) ?? [];
    existing.push(row);
    byBuild.set(row.handover_pack_id, existing);
  }

  return byBuild;
}

/**
 * The ledger oldest-first, which is the order a journey is read in.
 *
 * `getMemberHours` returns newest-first for the compact card; reversing here
 * rather than fetching twice, and named so the direction is a decision rather
 * than something a caller has to remember.
 */
export function asJourneyOrder(
  weeks: LedgerWeek[],
): { weekStartDate: string; hours: number }[] {
  return [...weeks]
    .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
    .map((week) => ({ weekStartDate: week.week_start_date, hours: week.hours }));
}
