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
    .eq("member_id", member.id)
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

/**
 * Save the actions-taken ticks without signing the week off (§4).
 *
 * §4's framing is "logged as you go, signed off at the end", and the schema was
 * built for it: `weekly_submissions.submitted_at` is nullable and the update
 * policy permits edits only while it is null. A draft row was always the
 * intended shape — the form just never wrote one, so a member ticking an action
 * on the day they did it lost it on the next refresh.
 *
 * Deliberately never sets `submitted_at`. Ticking a box is not signing off a
 * week, and a checklist that quietly submitted the log would take away the one
 * moment §4 asks the member to make on purpose.
 *
 * Silent on failure: this fires on every tick, and interrupting somebody
 * mid-checklist to report a dropped autosave would be worse than the dropped
 * autosave. The submit at the end sends the full set regardless.
 *
 * The week comes from the clock, exactly as `submitWeeklyLog` takes it, rather
 * than from the form. Two sources for "which week" is one too many: a page left
 * open across midnight on a Sunday would draft into the week it was rendered in
 * and submit into the one it was sent in, and the ticks would land on different
 * rows without anybody seeing why.
 */
export async function saveLogDraft(formData: FormData): Promise<void> {
  const member = await requireMember();

  const weekStart = currentWeekStart();

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
    .eq("member_id", member.id)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  const row = existing as { id: string; submitted_at: string | null } | null;

  // A signed-off week is what it said. RLS refuses this anyway; returning early
  // means it isn't attempted rather than failing quietly.
  if (row?.submitted_at) return;

  if (row) {
    await supabase
      .from("weekly_submissions")
      .update({ actions_taken: actionsTaken })
      .eq("id", row.id);
    return;
  }

  await supabase.from("weekly_submissions").insert({
    member_id: member.id,
    week_start_date: weekStart,
    actions_taken: actionsTaken,
  });
}
