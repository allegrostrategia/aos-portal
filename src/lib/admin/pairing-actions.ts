"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { matchPairings, type PastPairing } from "@/lib/pairing/match";
import { readSlots, type SlotId } from "@/lib/pairing/slots";

export type MatchState = { error?: string; notice?: string } | null;

/**
 * Run the month's matching (§9).
 *
 * Admin-triggered rather than scheduled, like the monthly draw: it happens once
 * a month, and a pass that ran itself and got something wrong would be harder to
 * notice than one somebody pressed.
 *
 * Refuses to run twice for a month that already has pairings. Re-matching would
 * move people who have already been told who they're meeting, which is worse
 * than leaving a late availability submission out until next month.
 */
export async function runMatching(
  _prev: MatchState,
  formData: FormData,
): Promise<MatchState> {
  const admin = await requireAdmin();

  const month = String(formData.get("pairing_month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick the month to match." };
  const pairingMonth = `${month}-01`;

  const supabase = await createClient();

  const { count: already } = await supabase
    .from("pairings")
    .select("id", { count: "exact", head: true })
    .eq("pairing_month", pairingMonth);

  if ((already ?? 0) > 0) {
    return {
      error:
        "That month is already matched. Re-running would move people who have already been told who they're meeting.",
    };
  }

  // Active members only — §1 locks pairing until active, since it's built around
  // a live challenge an onboarding member doesn't have yet.
  const { data: memberRows } = await supabase
    .from("members")
    .select("id")
    .eq("role", "member")
    .eq("status", "active");

  const members = ((memberRows ?? []) as { id: string }[]).map((m) => m.id);
  if (members.length < 2) {
    return { error: "Not enough active members to pair anyone up yet." };
  }

  const [{ data: availabilityRows }, { data: historyRows }] = await Promise.all([
    supabase
      .from("pairing_availability")
      .select("member_id, availability")
      .eq("pairing_month", pairingMonth),
    supabase.from("pairing_participants").select("pairing_id, member_id, pairing_month"),
  ]);

  const availability = new Map<string, SlotId[]>(
    ((availabilityRows ?? []) as { member_id: string; availability: unknown }[]).map(
      (row) => [row.member_id, readSlots(row.availability)],
    ),
  );

  // Every past pairing, grouped back into its two members.
  const byPairing = new Map<string, PastPairing>();
  for (const row of (historyRows ?? []) as {
    pairing_id: string;
    member_id: string;
    pairing_month: string;
  }[]) {
    const existing = byPairing.get(row.pairing_id) ?? {
      month: row.pairing_month,
      members: [],
    };
    existing.members.push(row.member_id);
    byPairing.set(row.pairing_id, existing);
  }

  const result = matchPairings({
    members,
    history: [...byPairing.values()],
    availability,
    // The odd one out gets Nina, still genuinely mutual (§9) — whoever is
    // running this, since they're the coach in the room.
    coachId: admin.id,
  });

  for (const pair of result.pairs) {
    const { data: created, error } = await supabase
      .from("pairings")
      .insert({ pairing_month: pairingMonth })
      .select("id")
      .maybeSingle();

    if (error || !created) {
      return { error: `Stopped part-way: ${error?.message ?? "couldn't create a pairing"}` };
    }

    const { error: participantError } = await supabase
      .from("pairing_participants")
      .insert(
        pair.members.map((memberId) => ({
          pairing_id: (created as { id: string }).id,
          member_id: memberId,
          // Overwritten by the sync trigger from the pairing itself.
          pairing_month: pairingMonth,
        })),
      );

    if (participantError) {
      return { error: `Stopped part-way: ${participantError.message}` };
    }
  }

  revalidatePath("/", "layout");

  const withCoach = result.pairs.filter((p) => p.withCoach).length;
  return {
    notice:
      `${result.pairs.length} ${result.pairs.length === 1 ? "pairing" : "pairings"} made` +
      (withCoach > 0 ? ", including one with you — the rotation landed odd." : ".") +
      (result.unmatched.length > 0
        ? ` ${result.unmatched.length} left unmatched.`
        : ""),
  };
}
