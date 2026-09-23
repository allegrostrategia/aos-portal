import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readRoadmap, allActions } from "@/lib/roadmap/shape";
import { milestoneJourney } from "@/lib/hours/milestones";
import { inMonth, monthRange } from "@/lib/recap/month";
import type { RecapSource } from "@/lib/recap/compile";

/**
 * A member's month, collated (brief §1).
 *
 * Admin-only: every read here goes through Nina's session and the admin
 * policies. Nothing is computed that a member cannot already see about
 * themselves in the portal — this screen saves Nina opening six of them.
 *
 * "In the month" is decided per source, and the choices are deliberate:
 *
 *   · time entries — by when the work happened (`started_at`)
 *   · the ledger and reflections — by the week they belong to, not when the
 *     row was written, so a Sunday sign-off counts to the week it describes
 *   · sign-offs — by `submitted_at`, matching the Piazza stat that already
 *     counts check-ins for the month
 *   · actions, builds — by when they were marked done or confirmed
 */
export async function getRecapSource(
  memberId: string,
  month: string,
): Promise<RecapSource | null> {
  const supabase = await createClient();
  const { start, endExclusive } = monthRange(month);

  const { data: memberRow } = await supabase
    .from("members")
    .select("full_name")
    .eq("id", memberId)
    .maybeSingle();
  const member = memberRow as { full_name: string } | null;
  if (!member) return null;

  const [
    { data: entryRows },
    { data: categoryRows },
    { data: submissionRows },
    { data: ledgerRows },
    { data: roadmapRow },
    { data: buildRows },
    { data: hotSeatRows },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("category_slug, duration_minutes")
      .eq("member_id", memberId)
      .gte("started_at", `${start}T00:00:00Z`)
      .lt("started_at", `${endExclusive}T00:00:00Z`)
      .not("ended_at", "is", null),
    supabase.from("time_categories").select("slug, label").order("sort_order"),
    supabase
      .from("weekly_submissions")
      .select("week_start_date, other_activity, actions_taken, submitted_at")
      .eq("member_id", memberId)
      .order("week_start_date"),
    supabase
      .from("hours_ledger")
      .select("week_start_date, hours")
      .eq("member_id", memberId)
      .order("week_start_date"),
    supabase
      .from("roadmap")
      .select("id, phases")
      .eq("member_id", memberId)
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("handover_pack")
      .select("id, title, confirmed_at, handover_pack_rates(hours_per_week, effective_from)")
      .eq("member_id", memberId)
      .not("confirmed_at", "is", null),
    supabase
      .from("hot_seat_submissions")
      .select("confirmed_challenge, confirmed_at, hot_seat_sessions(session_month)")
      .eq("member_id", memberId)
      .not("confirmed_at", "is", null),
  ]);

  // ---- time tracked -------------------------------------------------------
  const labels = new Map(
    ((categoryRows ?? []) as { slug: string; label: string }[]).map((c) => [c.slug, c.label]),
  );
  const minutesBySlug = new Map<string, number>();
  let loggedMinutes = 0;
  for (const entry of (entryRows ?? []) as {
    category_slug: string;
    duration_minutes: number | null;
  }[]) {
    const minutes = entry.duration_minutes ?? 0;
    loggedMinutes += minutes;
    minutesBySlug.set(entry.category_slug, (minutesBySlug.get(entry.category_slug) ?? 0) + minutes);
  }
  const byCategory = [...minutesBySlug.entries()]
    .map(([slug, minutes]) => ({ label: labels.get(slug) ?? slug, minutes }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  // ---- weekly logs: sign-offs, reflections, actions ticked in a week ------
  const submissions = (submissionRows ?? []) as {
    week_start_date: string;
    other_activity: string | null;
    actions_taken: Record<string, boolean> | null;
    submitted_at: string | null;
  }[];

  const weeksSignedOff = submissions.filter((row) => inMonth(row.submitted_at, month)).length;

  const reflections = submissions
    .filter((row) => inMonth(row.week_start_date, month) && (row.other_activity ?? "").trim())
    .map((row) => ({ weekStart: row.week_start_date, body: (row.other_activity ?? "").trim() }));

  const doneThisMonth = new Set<string>();
  for (const row of submissions) {
    if (!inMonth(row.week_start_date, month)) continue;
    for (const [actionId, on] of Object.entries(row.actions_taken ?? {})) {
      if (on) doneThisMonth.add(actionId);
    }
  }

  // ---- hours reclaimed and milestones ------------------------------------
  const ledger = ((ledgerRows ?? []) as { week_start_date: string; hours: string | number }[]).map(
    (row) => ({ weekStartDate: row.week_start_date, hours: Number(row.hours) }),
  );
  const journey = milestoneJourney(ledger);
  const hoursReclaimedThisMonth = ledger
    .filter((week) => inMonth(week.weekStartDate, month))
    .reduce((sum, week) => sum + week.hours, 0);
  const milestonesCrossed = journey.steps
    .filter((step) => step.reachedInWeek && inMonth(step.reachedInWeek, month))
    .map((step) => ({ target: step.target, weekStart: step.reachedInWeek! }));

  // ---- roadmap actions ----------------------------------------------------
  const roadmap = roadmapRow as { id: string; phases: unknown } | null;
  const actionsDone: RecapSource["actionsDone"] = [];
  if (roadmap) {
    // La Strada's own ticks carry a timestamp, so they can be dated to the
    // month; the log's ticks are dated by the week they were logged against,
    // which is what `doneThisMonth` above already holds.
    const { data: tickRows } = await supabase
      .from("roadmap_action_ticks")
      .select("action_id, done, updated_at")
      .eq("roadmap_id", roadmap.id);

    for (const tick of (tickRows ?? []) as {
      action_id: string;
      done: boolean;
      updated_at: string;
    }[]) {
      if (tick.done && inMonth(tick.updated_at, month)) doneThisMonth.add(tick.action_id);
      // Unticked since, whatever the log said: not finished, so not claimed.
      if (!tick.done) doneThisMonth.delete(tick.action_id);
    }

    const byId = new Map(
      allActions(readRoadmap(roadmap.phases)).map((entry) => [entry.action.id, entry]),
    );
    for (const actionId of doneThisMonth) {
      const entry = byId.get(actionId);
      if (!entry) continue; // An action edited away since; nothing to name.
      actionsDone.push({
        label: entry.action.label,
        monthTitle: entry.month.title || entry.focus.title || null,
      });
    }
    actionsDone.sort((a, b) => a.label.localeCompare(b.label));
  }

  // ---- the build, and the hot seat it came out of -------------------------
  const builds = ((buildRows ?? []) as {
    id: string;
    title: string;
    confirmed_at: string | null;
    handover_pack_rates: { hours_per_week: string | number; effective_from: string }[];
  }[])
    .filter((build) => inMonth(build.confirmed_at, month))
    .map((build) => {
      const rates = [...(build.handover_pack_rates ?? [])].sort((a, b) =>
        a.effective_from.localeCompare(b.effective_from),
      );
      const first = rates[0];
      return {
        title: build.title,
        hoursPerWeek: first ? Number(first.hours_per_week) : null,
      };
    });

  const hotSeat = ((hotSeatRows ?? []) as unknown as {
    confirmed_challenge: string | null;
    confirmed_at: string | null;
    hot_seat_sessions: { session_month: string } | null;
  }[]).find((row) => inMonth(row.hot_seat_sessions?.session_month, month));

  return {
    memberName: member.full_name,
    month,
    loggedMinutes,
    byCategory,
    weeksSignedOff,
    hoursReclaimedThisMonth,
    hoursReclaimedTotal: journey.total,
    milestonesCrossed,
    actionsDone,
    builds,
    hotSeatChallenge: hotSeat?.confirmed_challenge?.trim() || null,
    reflections,
  };
}
