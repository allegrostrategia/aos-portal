"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { firstMondayOfMonth } from "@/lib/onboarding/cadence";

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

  const { error } = await supabase.from("hot_seat_sessions").upsert(
    {
      session_month: sessionMonth,
      scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      zoom_url: zoomUrl || null,
    },
    { onConflict: "session_month" },
  );

  if (error) {
    return { error: `Couldn't save the session: ${error.message}` };
  }

  revalidatePath("/", "layout");

  const week = firstMondayOfMonth(sessionMonth);
  return {
    notice: scheduledFor
      ? "Saved — members can see the time and the link."
      : `Saved. Week one that month begins ${week}; members see "time to be confirmed" until you set one.`,
  };
}
