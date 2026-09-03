"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { isSlot } from "./slots";
import { pairingMonth } from "./queries";

export type PairingState = { error?: string; notice?: string } | null;

/**
 * Save when somebody can take a peer call (§9).
 *
 * Slots are checked against the grid rather than stored as sent. They arrive
 * from a form and end up deciding who gets matched with whom — a stale or made
 * up key would match nothing and quietly cost somebody a pairing, which is the
 * one outcome §9 most wants to avoid.
 *
 * Submitting with nothing ticked is allowed and means "not this month". §9 folds
 * this into the existing rhythm rather than making it a chore, and a month
 * somebody genuinely can't do is an answer, not a failure to respond.
 */
export async function saveAvailability(
  _prev: PairingState,
  formData: FormData,
): Promise<PairingState> {
  const member = await requireMember();

  const month = String(formData.get("pairing_month") ?? "").trim() || pairingMonth();
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { error: "Which month?" };

  const slots = formData.getAll("slots").map(String).filter(isSlot);

  const supabase = await createClient();
  const { error } = await supabase.from("pairing_availability").upsert(
    {
      member_id: member.id,
      pairing_month: month,
      availability: { slots },
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "member_id,pairing_month" },
  );

  if (error) return { error: `Couldn't save that: ${error.message}` };

  revalidatePath("/pairing");
  return {
    notice:
      slots.length === 0
        ? "Saved — you're sitting this month out."
        : `Saved. ${slots.length} ${slots.length === 1 ? "slot" : "slots"} to match against.`,
  };
}

/**
 * Mark that the call actually happened (§9).
 *
 * Tracked over time as signal, not shame — which is why there is no "we didn't
 * meet" button to press. A pairing that never gets marked is its own answer, and
 * asking somebody to declare a failure is how you stop them coming back.
 */
export async function markPairingMet(formData: FormData): Promise<void> {
  await requireMember();

  const pairingId = String(formData.get("pairing_id") ?? "").trim();
  if (!pairingId) return;

  const supabase = await createClient();
  await supabase
    .from("pairings")
    .update({ met_at: new Date().toISOString() })
    .eq("id", pairingId);

  revalidatePath("/pairing");
}
