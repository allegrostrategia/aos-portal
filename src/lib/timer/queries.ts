import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mondayOf } from "@/lib/onboarding/cadence";

export type TimeCategory = {
  slug: string;
  label: string;
  bucket: string;
  station_slug: string | null;
  uses_relational_check: boolean;
  sort_order: number;
};

export type TimeEntry = {
  id: string;
  category_slug: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  note: string | null;
  source: "timer" | "manual";
};

/** 10 logged hours is a completed week, and the draw-eligibility threshold (§4). */
export const COMPLETE_WEEK_MINUTES = 600;

export async function getTimeCategories(): Promise<TimeCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_categories")
    .select("*")
    .order("sort_order");

  return (data ?? []) as TimeCategory[];
}

/**
 * The entry currently running, if any. At most one per member — the database
 * enforces that with a partial unique index, so this can't quietly return the
 * wrong one of two.
 */
export async function getRunningEntry(): Promise<TimeEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_entries")
    .select("*")
    .is("ended_at", null)
    .maybeSingle();

  return (data as TimeEntry | null) ?? null;
}

/** Entries that started today, newest first. */
export async function getTodayEntries(): Promise<TimeEntry[]> {
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("time_entries")
    .select("*")
    .gte("started_at", startOfDay.toISOString())
    .order("started_at", { ascending: false });

  return (data ?? []) as TimeEntry[];
}

export type WeekTotal = {
  weekStartDate: string;
  loggedMinutes: number;
  isCompleteWeek: boolean;
};

/**
 * This week's total, from the `weekly_time_totals` view.
 *
 * The view derives from the entries rather than storing a running total — this
 * number decides draw eligibility, so it can't be allowed to drift from the
 * entries behind it.
 */
export async function getThisWeekTotal(): Promise<WeekTotal> {
  const supabase = await createClient();
  const weekStart = mondayOf(new Date().toISOString().slice(0, 10));

  const { data } = await supabase
    .from("weekly_time_totals")
    .select("*")
    .eq("week_start_date", weekStart)
    .maybeSingle();

  const row = data as
    | { logged_minutes: number; is_complete_week: boolean }
    | null;

  return {
    weekStartDate: weekStart,
    loggedMinutes: row?.logged_minutes ?? 0,
    isCompleteWeek: row?.is_complete_week ?? false,
  };
}
