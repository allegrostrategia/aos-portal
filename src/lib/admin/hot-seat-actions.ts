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
  const sessionId = String(formData.get("session_id") ?? "");
  const memberId = String(formData.get("member_id") ?? "");
  const confirmed = String(formData.get("confirmed_challenge") ?? "").trim();
  const suggested = String(formData.get("suggested_challenge") ?? "").trim();

  if (!submissionId && !(sessionId && memberId)) {
    return { error: "No submission given." };
  }
  if (!confirmed) {
    return { error: "The confirmed challenge is what goes into the room — it can't be blank." };
  }

  const supabase = await createClient();

  const fields = {
    confirmed_challenge: confirmed,
    confirmed_at: new Date().toISOString(),
    confirmed_by: admin.id,
    // Taken as drafted, or adjusted. Compared on the text rather than tracked
    // by a checkbox, so it can't drift from what actually happened.
    drafted_by: suggested && confirmed === suggested ? "claude" : "nina",
  };

  // A member who never submitted has no row at all, and §5 still expects them to
  // get a challenge — worked out from their tracked time instead of their words.
  // Creating the row here is what makes that possible; the alternative is a
  // prep sheet that can only prep the people who already did the work.
  const { error } = submissionId
    ? await supabase
        .from("hot_seat_submissions")
        .update(fields)
        .eq("id", submissionId)
    : await supabase
        .from("hot_seat_submissions")
        .insert({ session_id: sessionId, member_id: memberId, ...fields });

  if (error) return { error: `Couldn't confirm: ${error.message}` };

  revalidatePath("/", "layout");
  return { notice: "Locked. That's what goes into the session, and onto their Piazza." };
}

/**
 * Who was actually in the room (§5).
 *
 * Recorded after the call rather than inferred: attendance is not the same as
 * submitting, and the whole point of the fixed group slot is that showing up is
 * the commitment. `attended` stays null until Nina says either way, so "not
 * marked yet" and "didn't come" never collapse into the same thing — the
 * distinction matters for a member whose session simply hasn't happened.
 *
 * Marks against a submission if there is one, and creates the row if there
 * isn't: somebody can turn up without having submitted, which is exactly the
 * case worth being able to record.
 */
export async function setAttendance(
  _prev: SessionState,
  formData: FormData,
): Promise<SessionState> {
  await requireAdmin();

  const submissionId = String(formData.get("submission_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const memberId = String(formData.get("member_id") ?? "");
  const value = String(formData.get("attended") ?? "");

  if (!submissionId && !(sessionId && memberId)) {
    return { error: "No member given." };
  }

  const attended = value === "yes" ? true : value === "no" ? false : null;

  const supabase = await createClient();
  const { error } = submissionId
    ? await supabase
        .from("hot_seat_submissions")
        .update({ attended })
        .eq("id", submissionId)
    : await supabase
        .from("hot_seat_submissions")
        .insert({ session_id: sessionId, member_id: memberId, attended });

  if (error) return { error: `Couldn't record that: ${error.message}` };

  revalidatePath("/", "layout");
  return {
    notice:
      attended === null
        ? "Cleared."
        : attended
          ? "Marked as there."
          : "Marked as absent.",
  };
}

/**
 * Where the clipped replay ended up (§5).
 *
 * Its own action rather than a field on the schedule form, which upserts the
 * whole session: adding it there would wipe the note every time the time or the
 * Zoom link changed, and it would be lost silently at the moment Nina was doing
 * something unrelated.
 *
 * Producing the clip is a manual step after the call, so this is deliberately
 * just a note — the replay itself becomes library content through the library.
 */
export async function saveReplayNote(
  _prev: SessionState,
  formData: FormData,
): Promise<SessionState> {
  await requireAdmin();

  const sessionId = String(formData.get("session_id") ?? "");
  const note = String(formData.get("replay_note") ?? "").trim();
  if (!sessionId) return { error: "No session given." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hot_seat_sessions")
    .update({ replay_note: note || null })
    .eq("id", sessionId);

  if (error) return { error: `Couldn't save that: ${error.message}` };

  revalidatePath("/", "layout");
  return { notice: note ? "Saved." : "Cleared." };
}
