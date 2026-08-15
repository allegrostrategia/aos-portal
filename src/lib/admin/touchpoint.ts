import "server-only";

import { createClient } from "@/lib/supabase/server";
import { addDays, mondayOf } from "@/lib/onboarding/cadence";

export type TouchpointEntry = {
  id: string;
  week_start_date: string;
  other_activity: string;
  submitted_at: string | null;
  members: { full_name: string; email: string } | null;
};

export type TouchpointWeek = {
  weekStart: string;
  entries: TouchpointEntry[];
};

/**
 * What members wrote in "Anything else this week" — the Friday half of the
 * Friday/Monday touchpoint (§4).
 *
 * Returns the last two weeks, newest first, rather than "this week". Nina reads
 * this on a Monday morning, and by then the current week is one day old while
 * the submissions she's answering belong to the week that just ended. Defaulting
 * to the current week would show her an empty page at precisely the moment she
 * needs it — so both are shown and the date-arithmetic guess is avoided
 * altogether.
 */
export async function getRecentTouchpoints(): Promise<TouchpointWeek[]> {
  const supabase = await createClient();

  const thisMonday = mondayOf(new Date().toISOString().slice(0, 10));
  const from = addDays(thisMonday, -7);

  const { data } = await supabase
    .from("weekly_submissions")
    .select("id, week_start_date, other_activity, submitted_at, members(full_name, email)")
    .gte("week_start_date", from)
    .not("other_activity", "is", null)
    .order("week_start_date", { ascending: false })
    .order("submitted_at", { ascending: true, nullsFirst: false });

  const rows = (data ?? []) as unknown as TouchpointEntry[];

  const weeks: TouchpointWeek[] = [];
  for (const weekStart of [thisMonday, from]) {
    weeks.push({
      weekStart,
      entries: rows.filter((row) => row.week_start_date === weekStart),
    });
  }

  return weeks;
}
