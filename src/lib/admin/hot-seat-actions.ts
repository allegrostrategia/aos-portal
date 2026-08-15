"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstMondayOfMonth } from "@/lib/onboarding/cadence";
import { formatSessionTime, wallClockToUtc } from "@/lib/time-zone";

export type SessionState = { error?: string; notice?: string } | null;

/**
 * Schedule a month's hot seat (§5).
 *
 * One session per month, week one. The month is the identity — the exact slot
 * and the link are Nina's to set, and can be filled in later without blocking
 * members from seeing that the session exists.
 */
export async function saveSession(
  _prev: SessionState,
  formData: FormData,
): Promise<SessionState> {
  await requireAdmin();

  const month = String(formData.get("session_month") ?? "").trim();
  const scheduledFor = String(formData.get("scheduled_for") ?? "").trim();
  const zoomUrl = String(formData.get("zoom_url") ?? "").trim();

  if (!month) return { error: "Pick a month." };

  // A month input gives YYYY-MM; the column wants the first of that month.
  const sessionMonth = month.length === 7 ? `${month}-01` : month;

  if (zoomUrl && !/^https?:\/\//i.test(zoomUrl)) {
    return { error: "The Zoom link needs the https:// on the front." };
  }

  const supabase = await createClient();

  // What the time was before this save, so a change can be detected.
  const { data: before } = await supabase
    .from("hot_seat_sessions")
    .select("id, scheduled_for")
    .eq("session_month", sessionMonth)
    .maybeSingle();

  const previous = before as { id: string; scheduled_for: string | null } | null;
  const newInstant = scheduledFor ? wallClockToUtc(scheduledFor).toISOString() : null;
  const timeChanged =
    Boolean(previous) && previous?.scheduled_for !== newInstant;

  const { error } = await supabase.from("hot_seat_sessions").upsert(
    {
      session_month: sessionMonth,
      // The form gives a wall clock with no offset. Interpreted in UK time,
      // not the server's — a UTC server would otherwise read 23:00 UK as
      // 23:00 UTC and file the session an hour late.
      scheduled_for: scheduledFor ? wallClockToUtc(scheduledFor).toISOString() : null,
      zoom_url: zoomUrl || null,
    },
    { onConflict: "session_month" },
  );

  if (error) {
    return { error: `Couldn't save the session: ${error.message}` };
  }

  // Moving a session invalidates every reminder already sent about it: members
  // are holding a time that is no longer true, and nothing else would correct
  // them. Clearing the jobs lets the scheduler plan and send them again against
  // the new date.
  //
  // Safe to delete rather than archive — due_jobs is operational plumbing, and
  // the record of what a member was told is the email itself, not this row.
  if (timeChanged && previous) {
    const admin = createAdminClient();
    await admin
      .from("due_jobs")
      .delete()
      .like("kind", "hot_seat_%")
      .like("dedupe_key", `%:${previous.id}`);
  }

  revalidatePath("/", "layout");

  const week = firstMondayOfMonth(sessionMonth);
  return {
    notice: scheduledFor
      ? `Saved for ${formatSessionTime(wallClockToUtc(scheduledFor))} — UK time, which is what members see.${
          timeChanged ? " The time moved, so reminders will go out again against the new date." : ""
        }`
      : `Saved. Week one that month begins ${week}; members see "time to be confirmed" until you set one.`,
  };
}

/**
 * Lock a member's challenge for the session (§3, §5).
 *
 * This is the "Nina confirms" half. `drafted_by` records whether she took the
 * drafted suggestion as written or changed it — which is the only way to find
 * out whether the drafting is actually saving her anything, and worth knowing
 * before more of the product is built on the same pattern.
 */
export async function confirmChallenge(
  _prev: SessionState,
  formData: FormData,
): Promise<SessionState> {
  const admin = await requireAdmin();

  const submissionId = String(formData.get("submission_id") ?? "");
  const confirmed = String(formData.get("confirmed_challenge") ?? "").trim();
  const suggested = String(formData.get("suggested_challenge") ?? "").trim();

  if (!submissionId) return { error: "No submission given." };
  if (!confirmed) {
    return { error: "The confirmed challenge is what goes into the room — it can't be blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("hot_seat_submissions")
    .update({
      confirmed_challenge: confirmed,
      confirmed_at: new Date().toISOString(),
      confirmed_by: admin.id,
      // Taken as drafted, or adjusted. Compared on the text rather than tracked
      // by a checkbox, so it can't drift from what actually happened.
      drafted_by: suggested && confirmed === suggested ? "claude" : "nina",
    })
    .eq("id", submissionId);

  if (error) return { error: `Couldn't confirm: ${error.message}` };

  revalidatePath("/", "layout");
  return { notice: "Locked. That's what goes into the session, and onto their Piazza." };
}
