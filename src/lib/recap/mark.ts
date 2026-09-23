import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * "They've read it."
 *
 * Called from the read page's own render, in `after()`, rather than offered as
 * a button: opening the recap *is* the event, and asking somebody to confirm
 * they read what they are looking at is a tax on the one screen that should
 * just be the writing.
 *
 * Set once — `is("opened_at", null)` — so a second visit doesn't move the
 * timestamp Nina reads as "when it landed". The guard trigger keeps a member
 * to this column alone; nothing else on the row is theirs to change.
 *
 * A failure is logged, not surfaced. The recap still reads; what breaks is the
 * card going away and Nina's "read" badge, both of which are quiet enough to
 * hide a fault, which is exactly why this says so in the log.
 */
export async function markRecapOpened(memberId: string, month: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("monthly_recaps")
    .update({ opened_at: new Date().toISOString() })
    .eq("member_id", memberId)
    .eq("recap_month", month)
    .is("opened_at", null);

  if (error) console.error("[recap] couldn't mark opened", error.message);
}
