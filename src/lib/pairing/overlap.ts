import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { sendTo } from "@/lib/push/send";
import { pairingOverlapCopy, renderEmail } from "@/lib/jobs/copy";
import { readSlots, sharedSlots, slotLabel } from "./slots";

/**
 * The moment both of a pair have picked their dates, compare the two sets and
 * tell them both (brief, 21 Sep 2026).
 *
 * Called from two places, and safe from both: the availability action, once
 * the member's picks are saved (they may be the second partner), and matching,
 * for each new pairing (both may have picked before Nina pressed the button).
 * Either way the answer is the same — nothing until both have submitted, then
 * one message each, once.
 *
 * "Once" is enforced in the database, not in memory: `overlap_checked_at` is
 * claimed with an update conditioned on it being null, and only the caller
 * whose update landed sends. Two overlapping calls — a resubmit racing the
 * match — can't both get through.
 *
 * Goes the way the other pairing messages go, with one difference. Those are
 * queued for the daily cron because there is nothing to hurry; the brief wants
 * this one immediately, so it is sent here, from `after()`, and a delivery
 * failure is logged rather than retried — the same words are on the pairing
 * page and Piazza the moment the check has run, so nobody is left without the
 * answer. Email is gated on the member's "Pairing" switch as `pairing_booked`
 * is; push goes to every device regardless, as Nina's hot seat note does: it
 * is about their own call, once a month, and asks them to do something.
 *
 * Service role throughout: a member may read only their own picks, and this
 * has to read both.
 */
export type OverlapOutcome = "missing" | "waiting" | "already" | "notified";

export async function checkPairingOverlap(pairingId: string): Promise<OverlapOutcome> {
  const admin = createAdminClient();

  const { data: pairingRow } = await admin
    .from("pairings")
    .select("id, pairing_month, overlap_checked_at, pairing_participants(member_id)")
    .eq("id", pairingId)
    .maybeSingle();
  const pairing = pairingRow as
    | {
        id: string;
        pairing_month: string;
        overlap_checked_at: string | null;
        pairing_participants: { member_id: string }[];
      }
    | null;

  if (!pairing || pairing.pairing_participants.length < 2) return "missing";
  if (pairing.overlap_checked_at) return "already";

  const memberIds = pairing.pairing_participants.map((p) => p.member_id);

  const { data: availabilityRows } = await admin
    .from("pairing_availability")
    .select("member_id, availability, submitted_at")
    .eq("pairing_month", pairing.pairing_month)
    .in("member_id", memberIds);
  const submitted = new Map(
    ((availabilityRows ?? []) as {
      member_id: string;
      availability: unknown;
      submitted_at: string | null;
    }[])
      .filter((row) => row.submitted_at)
      .map((row) => [row.member_id, readSlots(row.availability, pairing.pairing_month)]),
  );

  if (memberIds.some((id) => !submitted.has(id))) return "waiting";

  // The claim. No row back means somebody else got there first.
  const { data: claimed } = await admin
    .from("pairings")
    .update({ overlap_checked_at: new Date().toISOString() })
    .eq("id", pairingId)
    .is("overlap_checked_at", null)
    .select("id");
  if (!claimed || (claimed as { id: string }[]).length === 0) return "already";

  const [a, b] = memberIds;
  const shared = sharedSlots(submitted.get(a) ?? [], submitted.get(b) ?? []);
  const sharedTimes = shared.map(slotLabel);

  const { data: peopleRows } = await admin
    .from("members")
    .select("id, email, full_name, status, notify_pairing")
    .in("id", memberIds);
  const people = new Map(
    ((peopleRows ?? []) as {
      id: string;
      email: string;
      full_name: string;
      status: string;
      notify_pairing: boolean;
    }[]).map((row) => [row.id, row]),
  );

  await Promise.all(
    memberIds.map(async (id) => {
      const me = people.get(id);
      const partner = people.get(memberIds.find((other) => other !== id)!);
      // Cancelled between matching and now: access is gone, and so is the message.
      if (!me || !partner || me.status === "cancelled") return;

      const copy = pairingOverlapCopy({
        firstName: me.full_name.split(" ")[0],
        partnerName: partner.full_name,
        sharedTimes,
        pairingUrl: `${env.siteUrl}/pairing`,
      });

      const deliveries: Promise<unknown>[] = [
        sendTo([id], {
          title: copy.subject,
          body: copy.body[1],
          url: "/pairing",
          tag: `pairing-overlap:${pairingId}`,
        }),
      ];
      if (me.notify_pairing) {
        deliveries.push(
          sendEmail({ to: me.email, subject: copy.subject, text: renderEmail(copy) }).then(
            (result) => {
              if (!result.ok) console.error("[pairing] overlap email failed", id, result.error);
            },
          ),
        );
      }
      await Promise.all(deliveries);
    }),
  );

  return "notified";
}
