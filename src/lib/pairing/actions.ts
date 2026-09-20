"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { isSlot } from "./slots";
import { getMyPairing, pairingMonth } from "./queries";
import { checkPairingOverlap } from "./overlap";

export type PairingState = { error?: string; notice?: string } | null;

/**
 * Save the dates and times somebody can take a peer call (§9; brief of
 * 21 Sep 2026).
 *
 * Slots are checked against the grid rather than stored as sent. They arrive
 * from a form and end up deciding whether two people are told they overlap — a
 * stale or made up key would match nothing and quietly cost somebody a call.
 *
 * Submitting with nothing picked is allowed and means "not this month". A
 * month somebody genuinely can't do is an answer, not a failure to respond.
 *
 * If the member is already paired this month, the overlap check runs once the
 * response is away: nothing happens unless their partner has picked too, and
 * then both hear at once. See `checkPairingOverlap`.
 */
export async function saveAvailability(
  _prev: PairingState,
  formData: FormData,
): Promise<PairingState> {
  const member = await requireMember();

  const month = String(formData.get("pairing_month") ?? "").trim() || pairingMonth();
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { error: "Which month?" };

  const slots = [...new Set(formData.getAll("slots").map(String))]
    .filter((slot) => isSlot(slot, month))
    .sort();

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

  const pairing = await getMyPairing(member.id, month);
  if (pairing) {
    const pairingId = pairing.id;
    after(() => checkPairingOverlap(pairingId));
  }

  revalidatePath("/pairing");
  revalidatePath("/piazza");
  return {
    notice:
      slots.length === 0
        ? "Saved. You're sitting this month out."
        : `Saved. ${slots.length} ${slots.length === 1 ? "time" : "times"} picked.` +
          (pairing
            ? " Once you've both picked, you'll both hear where you overlap."
            : " Once you're paired and you've both picked, you'll both hear where you overlap."),
  };
}

/**
 * Mark that the call actually happened (§9).
 *
 * Tracked over time as signal, not shame — which is why there is no "we didn't
 * meet" button to press. A pairing that never gets marked is its own answer, and
 * asking somebody to declare a failure is how you stop them coming back.
 */
/**
 * "It's in the diary" — the state between matched and met (L'Editoriale §5).
 * Either member may set or clear it; the row's own policy and guard trigger
 * decide, not this code.
 */
export async function setPairingBooked(formData: FormData): Promise<void> {
  await requireMember();

  const pairingId = String(formData.get("pairing_id") ?? "").trim();
  const booked = formData.get("booked") === "true";
  if (!pairingId) return;

  const supabase = await createClient();
  await supabase
    .from("pairings")
    .update({ booked_at: booked ? new Date().toISOString() : null })
    .eq("id", pairingId);

  revalidatePath("/pairing");
  revalidatePath("/piazza");
}

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
