import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * This month's prize draw, as the member sees it (round 6 §3).
 *
 * The bar is **one ten-hour week in the month** — what the reminder emails and
 * the log's own card have always said, and what `draw_eligibility` now applies
 * after a month of being four to five times stricter than its own copy
 * (migration 20260928120000).
 *
 * Counted by the database function rather than re-derived here: it already
 * decides what a complete week is, it is what the draw itself runs on, and a
 * second implementation of "ten hours in a Monday-week" is a second answer
 * waiting to disagree with the first. A member may call it for themselves;
 * anyone else's is admin-only, which the function enforces.
 */

/** Nina writes the real prize on the draw row; this stands in until she has. */
export const DEFAULT_PRIZE =
  "one asset, built by Nina: your choice of a single email, landing page, or template, done for you";

export type DrawStanding = {
  /** First of the month. */
  month: string;
  prize: string;
  /** Ten-hour weeks logged this month. */
  completeWeeks: number;
  /** One is the bar. */
  isIn: boolean;
};

export async function getDrawStanding(
  memberId: string,
  month: string,
): Promise<DrawStanding> {
  const supabase = await createClient();

  const [{ data: weeks }, { data: drawRow }] = await Promise.all([
    supabase.rpc("complete_weeks_in_month", { p_member_id: memberId, p_month: month }),
    supabase.from("draws").select("prize").eq("draw_month", month).maybeSingle(),
  ]);

  const completeWeeks = typeof weeks === "number" ? weeks : 0;
  const prize = (drawRow as { prize: string } | null)?.prize?.trim();

  return {
    month,
    prize: prize || DEFAULT_PRIZE,
    completeWeeks,
    isIn: completeWeeks >= 1,
  };
}
