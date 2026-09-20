import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { pairingMonth } from "@/lib/pairing/queries";
import { readSlots, sharedSlots, slotLabelShort } from "@/lib/pairing/slots";
import { formatCalendarMonth } from "@/lib/time-zone";
import { Badge, Card, Eyebrow, PageHeader, Stat } from "@/components/ui/card";
import { MatchForm } from "./match-form";

export const metadata: Metadata = { title: "Pairing · aOS admin" };

/**
 * Running the month's pairing (§9).
 *
 * Since 21 September 2026 the order is match first, pick dates after: the
 * matcher is rotation only, so there is nothing to wait for before pressing
 * the button. What's worth seeing is the other side — for each pair, whether
 * both have picked, and whether the app found them a time or told them to
 * work one out (`overlap_checked_at` and the picks themselves, which Nina can
 * read because she runs this).
 */
export default async function AdminPairingPage() {
  await requireAdmin();
  const month = pairingMonth();

  const supabase = await createClient();
  const [{ data: memberRows }, { data: availabilityRows }, { data: pairingRows }] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, full_name")
        .eq("role", "member")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("pairing_availability")
        .select("member_id, availability, submitted_at")
        .eq("pairing_month", month),
      supabase
        .from("pairings")
        .select("id, pairing_month, booked_at, met_at, flagged_at, overlap_checked_at, pairing_participants(member_id)")
        .order("pairing_month", { ascending: false }),
    ]);

  const members = (memberRows ?? []) as { id: string; full_name: string }[];
  const nameById = Object.fromEntries(members.map((m) => [m.id, m.full_name]));

  const availability = new Map(
    ((availabilityRows ?? []) as {
      member_id: string;
      availability: unknown;
      submitted_at: string | null;
    }[]).map((row) => [
      row.member_id,
      { slots: readSlots(row.availability, month), submitted: Boolean(row.submitted_at) },
    ]),
  );

  const pairings = (pairingRows ?? []) as {
    id: string;
    pairing_month: string;
    booked_at: string | null;
    met_at: string | null;
    flagged_at: string | null;
    overlap_checked_at: string | null;
    pairing_participants: { member_id: string }[];
  }[];

  const thisMonth = pairings.filter((p) => p.pairing_month === month);
  const answered = members.filter((m) => availability.get(m.id)?.submitted).length;

  // Where a pair stand on their dates: who hasn't picked, or what they share.
  const overlapFor = (pairing: (typeof pairings)[number]) => {
    const ids = pairing.pairing_participants.map((p) => p.member_id);
    const waiting = ids.filter((id) => !availability.get(id)?.submitted);
    if (waiting.length > 0) {
      return `Waiting on ${waiting.map((id) => nameById[id] ?? "you").join(" and ")} to pick dates`;
    }
    const shared = sharedSlots(
      availability.get(ids[0])?.slots ?? [],
      availability.get(ids[1])?.slots ?? [],
    );
    const told = pairing.overlap_checked_at ? "both told" : "not yet told";
    return shared.length === 0
      ? `Both picked, no time in common (${told})`
      : `Both free ${slotLabelShort(shared[0])}${shared.length > 1 ? ` and ${shared.length - 1} more` : ""} (${told})`;
  };

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Peer pairing"
        intro="Matched by rotation, never by what anyone does for a living, so nobody is ever the one who's never picked. If the count lands odd, the spare is paired with you."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display mb-3 text-heading font-medium text-ink">
              Run {formatCalendarMonth(month)}
            </h2>
            <MatchForm defaultMonth={month.slice(0, 7)} />
          </Card>

          <Card>
            <Stat
              label="Picked their dates"
              value={`${answered}/${members.length}`}
              detail={
                thisMonth.length > 0
                  ? "Each pair hears where they overlap the moment both have picked."
                  : "Matching is by rotation and doesn't wait for this. Pairs pick their dates once they know who they're meeting."
              }
            />
          </Card>
        </div>

        <section>
          <h2 className="font-display mb-3 text-heading font-medium text-ink">
            {thisMonth.length > 0
              ? `This month's pairings (${thisMonth.length})`
              : "Who's answered"}
          </h2>

          {thisMonth.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {thisMonth.map((pairing) => (
                <Card as="li" key={pairing.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="text-body text-ink">
                      {pairing.pairing_participants
                        .map((p) => nameById[p.member_id] ?? "You")
                        .join(" · ")}
                    </p>
                    <div className="flex gap-1.5">
                      {pairing.booked_at && !pairing.met_at ? <Badge>Booked</Badge> : null}
                      {pairing.met_at ? <Badge tone="sky">Met</Badge> : null}
                      {pairing.flagged_at ? <Badge tone="gold">Stalled</Badge> : null}
                    </div>
                  </div>
                  <p className="mt-1.5 text-caption text-ink/60">{overlapFor(pairing)}</p>
                </Card>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((m) => {
                const theirs = availability.get(m.id);
                return (
                  <Card as="li" key={m.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="text-small text-ink">{m.full_name}</p>
                      {theirs?.submitted ? (
                        <p className="text-caption text-ink/60">
                          {theirs.slots.length === 0
                            ? "Sitting this month out"
                            : `${theirs.slots.length} ${theirs.slots.length === 1 ? "time" : "times"} picked`}
                        </p>
                      ) : (
                        <Eyebrow>Not picked yet</Eyebrow>
                      )}
                    </div>
                  </Card>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
