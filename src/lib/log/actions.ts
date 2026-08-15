"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "./queries";

export type LogState = { error?: string; notice?: string } | null;

/**
 * Submit this week's log.
 *
 * One submission, three jobs (§4): the tracked time is already there from the
 * timer, this adds the actions taken against the roadmap and anything that
 * happened outside it. The monthly challenge is deliberately not editable here —
 * it's confirmed during Nina's hot seat prep and only displayed on this screen.
 *
 * Submitting is final. RLS only permits updates while `submitted_at` is null, so
 * a dated log entry stays what it said at the time rather than becoming a
 * document that quietly keeps changing.
 */
export async function submitWeeklyLog(
  _prev: LogState,
  formData: FormData,
): Promise<LogState> {
  const member = await requireMember();

  const weekStart = currentWeekStart();
  const otherActivity = String(formData.get("other_activity") ?? "").trim();

  // Checkbox names are prefixed so an item key can't collide with another field.
  const actionsTaken: Record<string, boolean> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("action:") && value === "on") {
      actionsTaken[name.slice("action:".length)] = true;
    }
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("weekly_submissions")
    .select("id, submitted_at")
    .eq("week_start_date", weekStart)
    .maybeSingle();

  const row = existing as { id: string; submitted_at: string | null } | null;

  if (row?.submitted_at) {
    return { error: "This week's log is already in — it can't be edited after." };
  }

  const payload = {
    actions_taken: actionsTaken,
    other_activity: otherActivity || null,
    submitted_at: new Date().toISOString(),
  };

  const { error } = row
    ? await supabase.from("weekly_submissions").update(payload).eq("id", row.id)
    : await supabase.from("weekly_submissions").insert({
        member_id: member.id,
        week_start_date: weekStart,
        ...payload,
      });

  if (error) {
    return { error: `Couldn't save your log: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return { notice: "Logged. That's this week accounted for." };
}
