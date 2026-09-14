import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { getMyAvailability, getMyPairing, getSharedSlots, pairingMonth } from "@/lib/pairing/queries";
import { datesForWeekday, SLOT_DAYS, slotLabel } from "@/lib/pairing/slots";
import { utcToWallClock } from "@/lib/time-zone";
import { resolveNames } from "@/lib/chat/queries";
import { getHeadshotUrls } from "@/lib/directory/queries";
import { markPairingMet, setPairingBooked } from "@/lib/pairing/actions";
import { formatCalendarMonth, formatSessionTime } from "@/lib/time-zone";
import { Avatar } from "@/components/avatar";
import { Card, Eyebrow, PageHeader, SectionTitle } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { OpenDirectMessage } from "./open-dm";
import { AvailabilityForm } from "./availability-form";

export const metadata: Metadata = { title: "Peer pairing — aOS" };

/**
 * The three icebreakers — fixed copy, confirmed in the brief. Not stored,
 * because there is nothing to vary: the same three, every month, for everyone.
 */
const ICEBREAKERS = [
  "What's one challenge you're struggling with right now that your peer pair could help with?",
  "What's one idea you want to run by your peer pair for market research?",
  "What's one thing you want to ask your peer pair?",
];

/**
 * Peer pairing (§9): monthly, one to one, mutual.
 *
 * L'Editoriale "11": the two of you side by side as photographs, who you're
 * paired with, when you both said you're free, Message and View profile, the
 * three conversation starters, and two ticks — booked, then met.
 *
 * Matched by rotation, never by skill or business type — so this screen shows
 * who you're meeting and when you both said you're free, and nothing about who
 * they are that could read as a reason they were chosen. The coach month (odd
 * months, paired with Nina) uses exactly this card: no special case, no
 * different treatment.
 *
 * No call link, deliberately. §9 has the pair arranging that themselves, which
 * is why the button here opens a conversation rather than a meeting. And no
 * online dot — presence isn't tracked, so it isn't shown.
 */
export default async function PairingPage() {
  const member = (await getCurrentMember())!;
  const month = pairingMonth();

  const [pairing, availability] = await Promise.all([
    getMyPairing(member.id, month),
    getMyAvailability(member.id, month),
  ]);

  const partnerId = pairing?.partnerId ?? null;
  const today = utcToWallClock(new Date()).slice(0, 10);
  const [names, headshots, shared] = await Promise.all([
    partnerId ? resolveNames([partnerId]) : Promise.resolve(new Map<string, string>()),
    getHeadshotUrls(partnerId ? [member.id, partnerId] : [member.id]),
    pairing ? getSharedSlots(pairing.id) : Promise.resolve([] as string[]),
  ]);

  // "You're both free Tuesday afternoons (15, 22, 29 Sep)". Computed from
  // what both actually ticked — scheduled_for was never written by anything,
  // so the earlier line here never showed.
  const sharedLine = shared
    .map((slot) => {
      const day = SLOT_DAYS.find((d) => slot.startsWith(`${d.key}-`));
      const dates = day ? datesForWeekday(month, day.isoWeekday, today).map((d) => Number(d.slice(8))) : [];
      return `${slotLabel(slot).replace(/(morning|afternoon|evening)$/, "$1s")}${dates.length ? ` (${dates.join(", ")})` : ""}`;
    })
    .join("; ");
  const partnerName = partnerId ? (names.get(partnerId) ?? "your partner") : null;
  const partnerFirst = partnerName?.split(" ")[0] ?? "them";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <PageHeader title="Your peer pairing" tagline="Accountability creates momentum." />

      {pairing && partnerId ? (
        <Card className="mb-6">
          {/* The two of you. Real headshots, initials where there isn't one yet. */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: member.id, name: member.full_name, label: "You" },
              { id: partnerId, name: partnerName ?? "", label: partnerFirst },
            ].map((person) => (
              <div
                key={person.id}
                className="relative aspect-square overflow-hidden rounded-2xl bg-cream-deep"
              >
                {headshots.get(person.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headshots.get(person.id)}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Avatar name={person.name} size="xl" className="ring-0" />
                  </div>
                )}
                <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2.5 py-1 text-caption font-medium text-cream">
                  {person.label}
                </span>
              </div>
            ))}
          </div>

          <Eyebrow className="mt-6">This month you&rsquo;re paired with</Eyebrow>
          <p className="font-display mt-1 text-title font-medium text-ink">{partnerName}</p>

          <p className="mt-3 text-small text-ink/80">
            {pairing.scheduledFor
              ? `You're both free ${formatSessionTime(pairing.scheduledFor)}.`
              : sharedLine
                ? `You're both free ${sharedLine}.`
                : "No time you both ticked. Pick one between you."}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <OpenDirectMessage memberId={partnerId} label="Message" />
            <Link
              href={`/sociale/directory?q=${encodeURIComponent(partnerName ?? "")}`}
              className={buttonClasses("secondary", "md")}
            >
              View profile
            </Link>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-ink/8 pt-5">
            {/* Booked, then met. Two separate claims, because a call in the
                diary and a call that happened are different facts, and the
                day-7 check cares about the difference. */}
            <form action={setPairingBooked} className="flex items-center gap-3">
              <input type="hidden" name="pairing_id" value={pairing.id} />
              <input type="hidden" name="booked" value={pairing.bookedAt ? "false" : "true"} />
              <button
                type="submit"
                role="checkbox"
                aria-checked={Boolean(pairing.bookedAt)}
                className="flex items-center gap-3 text-left"
              >
                <Tick on={Boolean(pairing.bookedAt)} />
                <span className="text-body text-ink">
                  We&rsquo;ve booked a time
                  {pairing.bookedAt ? (
                    <span className="block text-caption text-ink/55">In the diary — tap to undo.</span>
                  ) : null}
                </span>
              </button>
            </form>

            {pairing.metAt ? (
              <p className="flex items-center gap-3 text-body text-ink">
                <Tick on />
                We met — good.
              </p>
            ) : (
              <form action={markPairingMet}>
                <input type="hidden" name="pairing_id" value={pairing.id} />
                <Button type="submit" size="sm" variant="secondary">
                  We met
                </Button>
              </form>
            )}
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-small text-ink/70">
            {availability.submitted
              ? "You're in for this month. Pairings go out once everyone's had a chance to say when they're free."
              : "No pairing yet this month. Say when you're free below and you'll be matched."}
          </p>
        </Card>
      )}

      {/* Always here, paired or not (brief A10): they're for structuring the
          call, and somebody waiting on a match should still be able to read
          them. */}
      <SectionTitle>Conversation starters</SectionTitle>
      <Card className="mb-6">
        <ol className="flex flex-col gap-3">
          {ICEBREAKERS.map((prompt, i) => (
            <li key={prompt} className="flex gap-3">
              <span className="font-display mt-0.5 w-6 shrink-0 text-heading text-orange">
                {i + 1}
              </span>
              <p className="text-body text-ink/85">{prompt}</p>
            </li>
          ))}
        </ol>
      </Card>

      <SectionTitle aside={formatCalendarMonth(month)}>When could you talk?</SectionTitle>
      <Card>
        <AvailabilityForm month={month} selected={availability.slots} today={today} />
      </Card>
    </main>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
        on ? "border-orange bg-orange text-white" : "border-ink/25 text-transparent"
      }`}
    >
      <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="m4.5 10.5 3.5 3.5 7.5-8" />
      </svg>
    </span>
  );
}
