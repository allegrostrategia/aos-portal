import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/member";
import { getMyAvailability, getMyPairing, pairingMonth } from "@/lib/pairing/queries";
import { resolveNames } from "@/lib/chat/queries";
import { markPairingMet } from "@/lib/pairing/actions";
import { formatCalendarMonth, formatSessionTime } from "@/lib/time-zone";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OpenDirectMessage } from "./open-dm";
import { AvailabilityForm } from "./availability-form";

export const metadata: Metadata = { title: "Peer pairing — aOS" };

/**
 * Peer pairing (§9): monthly, one to one, mutual.
 *
 * Matched by rotation, never by skill or business type — so this screen shows
 * who you're meeting and when you both said you're free, and nothing about who
 * they are that could read as a reason they were chosen.
 *
 * No call link, deliberately. §9 has the pair arranging that themselves, which
 * is why the button here opens a conversation rather than a meeting.
 */
export default async function PairingPage() {
  const member = (await getCurrentMember())!;
  const month = pairingMonth();

  const [pairing, availability] = await Promise.all([
    getMyPairing(member.id, month),
    getMyAvailability(member.id, month),
  ]);

  const names = pairing?.partnerId
    ? await resolveNames([pairing.partnerId])
    : new Map<string, string>();
  const partnerName = pairing?.partnerId
    ? (names.get(pairing.partnerId) ?? "your partner")
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow={formatCalendarMonth(month)}
        title="Your peer pairing"
        intro="One conversation a month with another member. Both of you bring something, both of you give and get — about fifteen minutes each way. Matched by rotation, so over time you meet everyone."
      />

      {pairing && pairing.partnerId ? (
        <Card className="mb-6 bg-sky/15">
          <Eyebrow>This month you&rsquo;re paired with</Eyebrow>
          <p className="font-display mt-1 text-title text-navy italic">
            {partnerName}
          </p>

          {pairing.scheduledFor ? (
            <p className="mt-2 text-small text-navy/80">
              You both said {formatSessionTime(pairing.scheduledFor)} works.
            </p>
          ) : (
            <p className="mt-2 text-small text-navy/70">
              No time you both ticked, so pick one between you.
            </p>
          )}

          <p className="mt-3 text-small text-navy/70">
            Message each other to sort out when and where — there&rsquo;s no call
            link here on purpose, it&rsquo;s your conversation to arrange.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <OpenDirectMessage
              memberId={pairing.partnerId}
              label={`Message ${partnerName?.split(" ")[0] ?? "them"}`}
            />

            {pairing.metAt ? (
              <span className="text-caption text-navy/60">
                Marked as met — good.
              </span>
            ) : (
              <form action={markPairingMet}>
                <input type="hidden" name="pairing_id" value={pairing.id} />
                <Button type="submit" size="sm" variant="ghost">
                  We met
                </Button>
              </form>
            )}
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-small text-navy/70">
            {availability.submitted
              ? "You're in for this month. Pairings go out once everyone's had a chance to say when they're free."
              : "No pairing yet this month. Say when you're free below and you'll be matched."}
          </p>
        </Card>
      )}

      <h2 className="font-display mb-3 text-heading text-navy italic">
        When could you talk?
      </h2>
      <Card>
        <AvailabilityForm month={month} selected={availability.slots} />
      </Card>
    </main>
  );
}
