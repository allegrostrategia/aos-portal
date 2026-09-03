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

  // Queue the two notifications per pairing (§9). Queued rather than sent from
  // here so a delivery failure is retried and reported by the runner, and so
  // matching itself can't half-succeed on a bad connection to Resend.
  //
  // `pairing_booked` is due today; `pairing_day7` a week out, and it re-checks
  // at send time whether they've since confirmed they met.
  const created = (
    (
      await supabase
        .from("pairings")
        .select("id, pairing_participants(member_id)")
        .eq("pairing_month", pairingMonth)
    ).data ?? []
  ) as { id: string; pairing_participants: { member_id: string }[] }[];

  const today = new Date();
  const daySeven = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const asDate = (d: Date) => d.toISOString().slice(0, 10);

  const jobs = created.flatMap((pairing) => [
    ...pairing.pairing_participants.map((participant) => ({
      kind: "pairing_booked" as const,
      member_id: participant.member_id,
      due_on: asDate(today),
      dedupe_key: `pairing_booked:${pairing.id}:${participant.member_id}`,
      payload: { pairing_id: pairing.id },
    })),
    {
      // The flag goes to Nina, not the pair (§9) — chasing two people quietly
      // sorting it out themselves would be noise.
      kind: "pairing_day7" as const,
      member_id: admin.id,
      due_on: asDate(daySeven),
      dedupe_key: `pairing_day7:${pairing.id}`,
      payload: { pairing_id: pairing.id },
    },
  ]);

  if (jobs.length > 0) {
    const { error: queueError } = await supabase
      .from("due_jobs")
      .upsert(jobs, { onConflict: "dedupe_key", ignoreDuplicates: true });

    // Checked, because the failure is invisible otherwise: the pairings exist
    // and look right, and nobody is ever told about them. Said out loud rather
    // than swallowed — the pairings are real and shouldn't be undone, so this
    // reports what didn't happen instead of pretending the run succeeded.
    if (queueError) {
      return {
        error:
          `Pairings were made, but the emails couldn't be queued: ${queueError.message}. ` +
          `Nobody has been told yet.`,
      };
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
