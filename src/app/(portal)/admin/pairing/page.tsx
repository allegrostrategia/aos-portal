import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { pairingMonth } from "@/lib/pairing/queries";
import { readSlots, slotLabel } from "@/lib/pairing/slots";
import { formatCalendarMonth } from "@/lib/time-zone";
import { Badge, Card, Eyebrow, PageHeader, Stat } from "@/components/ui/card";
import { MatchForm } from "./match-form";

export const metadata: Metadata = { title: "Pairing — aOS admin" };

/**
 * Running the month's pairing (§9).
 *
 * Shows who has said they're free before anything is matched, because the
 * matcher runs once and won't re-run — knowing three people haven't answered yet
 * is the difference between waiting a day and pairing them against nothing.
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
        .select("id, pairing_month, met_at, flagged_at, pairing_participants(member_id)")
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
      { slots: readSlots(row.availability), submitted: Boolean(row.submitted_at) },
    ]),
  );

  const pairings = (pairingRows ?? []) as {
    id: string;
    pairing_month: string;
    met_at: string | null;
    flagged_at: string | null;
    pairing_participants: { member_id: string }[];
  }[];

  const thisMonth = pairings.filter((p) => p.pairing_month === month);
  const answered = members.filter((m) => availability.get(m.id)?.submitted).length;

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Peer pairing"
        intro="Matched by rotation, never by what anyone does for a living — so nobody is ever the one who's never picked. If the count lands odd, the spare is paired with you."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display mb-3 text-heading text-navy italic">
              Run {formatCalendarMonth(month)}
            </h2>
            <MatchForm defaultMonth={month.slice(0, 7)} />
          </Card>

          <Card>
            <Stat
              label="Said when they're free"
              value={`${answered}/${members.length}`}
              detail={
                answered < members.length
                  ? "Matching runs once — worth waiting on the rest."
                  : "Everyone has answered."
              }
            />
          </Card>
        </div>

        <section>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            {thisMonth.length > 0
              ? `This month's pairings (${thisMonth.length})`
              : "Who's answered"}
          </h2>

          {thisMonth.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {thisMonth.map((pairing) => (
                <Card as="li" key={pairing.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="text-body text-navy">
                      {pairing.pairing_participants
                        .map((p) => nameById[p.member_id] ?? "You")
                        .join(" · ")}
                    </p>
                    <div className="flex gap-1.5">
                      {pairing.met_at ? <Badge tone="sky">Met</Badge> : null}
                      {pairing.flagged_at ? <Badge tone="gold">Stalled</Badge> : null}
                    </div>
                  </div>
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
                      <p className="text-small text-navy">{m.full_name}</p>
                      {theirs?.submitted ? (
                        <p className="text-caption text-navy/60">
                          {theirs.slots.length === 0
                            ? "Sitting this month out"
                            : theirs.slots.map(slotLabel).join(", ")}
                        </p>
                      ) : (
                        <Eyebrow>No answer yet</Eyebrow>
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
