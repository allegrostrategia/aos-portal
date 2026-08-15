import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mondayOf, addDays } from "@/lib/onboarding/cadence";

export type WeeklySubmission = {
  id: string;
  week_start_date: string;
  actions_taken: Record<string, boolean>;
  other_activity: string | null;
  submitted_at: string | null;
};

export type CategoryTotal = {
  slug: string;
  label: string;
  minutes: number;
};

/** A single actionable line from the roadmap, flattened out of its phase. */
export type RoadmapItem = {
  key: string;
  label: string;
  phaseTitle: string | null;
};

export function currentWeekStart(): string {
  return mondayOf(new Date().toISOString().slice(0, 10));
}

export async function getWeeklySubmission(
  memberId: string,
  weekStart: string,
): Promise<WeeklySubmission | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weekly_submissions")
    .select("*")
    .eq("member_id", memberId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  return (data as WeeklySubmission | null) ?? null;
}

/**
 * This week's tracked time, grouped by category.
 *
 * Grouped here rather than in SQL because the week's entries are a handful of
 * rows — a view per grouping would be more machinery than the problem needs.
 */
export async function getWeekCategoryTotals(
  memberId: string,
  weekStart: string,
): Promise<CategoryTotal[]> {
  const supabase = await createClient();

  const weekEnd = addDays(weekStart, 7);

  const [{ data: entries }, { data: categories }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("category_slug, duration_minutes")
      .eq("member_id", memberId)
      .gte("started_at", `${weekStart}T00:00:00Z`)
      .lt("started_at", `${weekEnd}T00:00:00Z`)
      .not("ended_at", "is", null),
    supabase.from("time_categories").select("slug, label").order("sort_order"),
  ]);

  const minutesBySlug = new Map<string, number>();
  for (const entry of (entries ?? []) as {
    category_slug: string;
    duration_minutes: number | null;
  }[]) {
    minutesBySlug.set(
      entry.category_slug,
      (minutesBySlug.get(entry.category_slug) ?? 0) + (entry.duration_minutes ?? 0),
    );
  }

  return ((categories ?? []) as { slug: string; label: string }[])
    .map((category) => ({
      slug: category.slug,
      label: category.label,
      minutes: minutesBySlug.get(category.slug) ?? 0,
    }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * The checkable items from the member's current roadmap.
 *
 * Returns an empty list when there's no confirmed roadmap yet — during
 * onboarding weeks 2–3 there simply isn't one (§4), and the log falls back to
 * the free-response box on its own.
 */
export async function getRoadmapItems(memberId: string): Promise<RoadmapItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roadmap")
    .select("phases")
    .eq("member_id", memberId)
    .eq("is_current", true)
    .not("confirmed_at", "is", null)
    .maybeSingle();

  const phases = (data?.phases ?? []) as {
    title?: string;
    items?: (string | { id?: string; label?: string })[];
  }[];

  const items: RoadmapItem[] = [];

  phases.forEach((phase, phaseIndex) => {
    (phase.items ?? []).forEach((item, itemIndex) => {
      const label = typeof item === "string" ? item : (item.label ?? "");
      if (!label) return;

      // Stable key: what gets stored in actions_taken. Prefer an explicit id
      // from the roadmap so re-ordering phases doesn't detach past ticks.
      const key =
        typeof item === "object" && item.id
          ? item.id
          : `${phaseIndex}:${itemIndex}`;

      items.push({ key, label, phaseTitle: phase.title ?? null });
    });
  });

  return items;
}
