import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readSlots, type SlotId } from "./slots";

/** First of the month, which is how every monthly table here is keyed. */
export function pairingMonth(date = new Date()): string {
  return `${date.toISOString().slice(0, 7)}-01`;
}

export type MyPairing = {
  id: string;
  month: string;
  scheduledFor: string | null;
  metAt: string | null;
  partnerId: string | null;
};

/**
 * This month's pairing, if there is one.
 *
 * RLS returns only pairings the member is in — `is_my_pairing()` exists because
 * expressing that on `pairing_participants` directly would query the table its
 * own policy is on, which Postgres rejects as recursion.
 */
export async function getMyPairing(
  memberId: string,
  month: string,
): Promise<MyPairing | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pairings")
    .select("id, pairing_month, scheduled_for, met_at, pairing_participants(member_id)")
    .eq("pairing_month", month)
    .maybeSingle();

  const row = data as
    | {
        id: string;
        pairing_month: string;
        scheduled_for: string | null;
        met_at: string | null;
        pairing_participants: { member_id: string }[];
      }
    | null;

  if (!row) return null;

  return {
    id: row.id,
    month: row.pairing_month,
    scheduledFor: row.scheduled_for,
    metAt: row.met_at,
    partnerId:
      row.pairing_participants.find((p) => p.member_id !== memberId)?.member_id ??
      null,
  };
}

/** What this member said they could do — their own row only. */
export async function getMyAvailability(
  memberId: string,
  month: string,
): Promise<{ slots: SlotId[]; submitted: boolean }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pairing_availability")
    .select("availability, submitted_at")
    .eq("member_id", memberId)
    .eq("pairing_month", month)
    .maybeSingle();

  const row = data as
    | { availability: unknown; submitted_at: string | null }
    | null;

  return {
    slots: readSlots(row?.availability),
    submitted: Boolean(row?.submitted_at),
  };
}
