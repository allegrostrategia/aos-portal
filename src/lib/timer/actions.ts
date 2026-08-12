"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type TimerState = { error?: string } | null;

/**
 * Timestamps are set here, on the server, never from the browser. A member's
 * device clock can be minutes out, and the whole point of live tracking is that
 * the numbers are real — a roadmap built on a wrong clock is worse than one
 * built on an honest guess.
 */
function nowIso() {
  return new Date().toISOString();
}

/** Anything shorter than this was a misclick, not a task. */
const MINIMUM_SECONDS = 5;

async function stopRunning(): Promise<void> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("time_entries")
    .select("id, started_at")
    .is("ended_at", null)
    .maybeSingle();

  if (!data) return;

  const running = data as { id: string; started_at: string };
  const elapsedSeconds =
    (Date.now() - new Date(running.started_at).getTime()) / 1000;

  if (elapsedSeconds < MINIMUM_SECONDS) {
    // Discard rather than save. Also dodges the `ended_at > started_at` check
    // constraint, which a fast enough double-tap could otherwise violate.
    await supabase.from("time_entries").delete().eq("id", running.id);
    return;
  }

  await supabase
    .from("time_entries")
    .update({ ended_at: nowIso() })
    .eq("id", running.id);
}

/**
 * Start the timer on a category.
 *
 * Starting while something else runs stops that first — switching task is the
 * common case, and it's how people actually work. The database allows only one
 * running entry per member, so without this the second start would simply fail
 * with a unique-violation nobody can act on.
 */
export async function startTimer(formData: FormData): Promise<void> {
  const member = await requireMember();
  const categorySlug = String(formData.get("category_slug") ?? "");

  if (!categorySlug) return;

  await stopRunning();

  const supabase = await createClient();
  await supabase.from("time_entries").insert({
    member_id: member.id,
    category_slug: categorySlug,
    started_at: nowIso(),
    source: "timer",
  });

  revalidatePath("/", "layout");
}

export async function stopTimer(): Promise<void> {
  await requireMember();
  await stopRunning();
  revalidatePath("/", "layout");
}

export async function deleteEntry(formData: FormData): Promise<void> {
  await requireMember();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS confines this to the member's own entries, so no ownership check here
  // would add anything a policy isn't already enforcing.
  await supabase.from("time_entries").delete().eq("id", id);

  revalidatePath("/", "layout");
}

/**
 * Log time after the fact, for when someone forgot to start the timer.
 *
 * Recorded as `source: 'manual'` rather than passed off as live tracking — §4
 * is built on real-time logging, and knowing which entries were reconstructed
 * from memory is exactly the kind of thing the diagnostic should be able to see.
 */
export async function addManualEntry(
  _prev: TimerState,
  formData: FormData,
): Promise<TimerState> {
  const member = await requireMember();

  const categorySlug = String(formData.get("category_slug") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!categorySlug || !date || !startTime || !endTime) {
    return { error: "Pick a category, a date, and both times." };
  }

  // Built as local times, then serialised to UTC — a member entering "09:00"
  // means nine in the morning where they are.
  const startedAt = new Date(`${date}T${startTime}`);
  const endedAt = new Date(`${date}T${endTime}`);

  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return { error: "Those times didn't parse — try again." };
  }
  if (endedAt <= startedAt) {
    return { error: "The finish time needs to be after the start time." };
  }
  if (startedAt > new Date()) {
    return { error: "That's in the future — log it once it's happened." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    member_id: member.id,
    category_slug: categorySlug,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    note: note || null,
    source: "manual",
  });

  if (error) {
    return { error: `Couldn't save that: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return null;
}
