import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { countCheckInsThisMonth, currentWeekStart, getRoadmapItems, getWeeklySubmission } from "@/lib/log/queries";
import {
  getComments,
  getMySubmission,
  getUpcomingSession,
  hasUnseenCoachComment,
} from "@/lib/hot-seat/queries";
import { getPiazzaRoadmap } from "@/lib/piazza/queries";
import { quoteOfTheDay } from "@/lib/piazza/quotes";
import { greeting } from "@/lib/piazza/greeting";
import { getMemberHours } from "@/lib/hours/queries";
import { formatHours, milestoneProgress } from "@/lib/hours/milestones";
import { getMyAvailability, getMyPairing, getSharedSlots, pairingMonth } from "@/lib/pairing/queries";
import { slotLabelShort } from "@/lib/pairing/slots";
import { resolveNames } from "@/lib/chat/queries";
import { getOnboardingProgress } from "@/lib/onboarding/progress";
import { formatSessionTime, utcToWallClock } from "@/lib/time-zone";
import { Card, Chevron, Eyebrow, Quote, SectionTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { OnboardingPath } from "@/components/onboarding/onboarding-path";
import { InstallPrompt } from "@/components/install-prompt";

export const metadata: Metadata = { title: "Piazza · aOS" };

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/London",
});

/**
 * Piazza — the daily homepage (§2), L'Editoriale "02".
 *
 * "I'm arriving at my business today," not "I've opened an app." The order,
 * from the brief:
 *
 *   1. Onboarding progress — only while any of the six steps is left
 *   2. The metrics strip — hours this month, weekly goals, upcoming sessions
 *   3. The quote of the day, over the hero
 *   4. The task list — what actually needs doing now
 *   5. Hot seat, Milestones and Pairing cards — each a real route in, since
 *      none of the three has a nav slot any more
 *
 * The onboarding section is *not* gated on status. It reads the six steps,
 * and some of those complete after a member is active. See progress.ts.
 *
 * Widgets whose data doesn't exist yet are omitted rather than shown empty. A
 * task list with nothing on it says so in one line; a pairing card with no
 * pairing points at the availability form; the community goal from §2 is
 * still absent because nobody has said what it counts towards.
 *
 * No photograph at the top. The quote sits on a plain orange block; the
 * metrics strip is a cream card on it. That leaves the bottom nav as the only
 * place the glass blur is used.
 */
export default async function PiazzaPage() {
  const member = (await getCurrentMember())!;
  const weekStart = currentWeekStart();
  const today = utcToWallClock(new Date()).slice(0, 10);
  const month = pairingMonth();

  const [
    onboardingProgress,
    submission,
    roadmapItems,
    session,
    checkIns,
    roadmap,
    hours,
    pairing,
    availability,
  ] = await Promise.all([
    getOnboardingProgress(member),
    getWeeklySubmission(member.id, weekStart),
    getRoadmapItems(member.id),
    getUpcomingSession(),
    countCheckInsThisMonth(member.id, today),
    getPiazzaRoadmap(member.id),
    getMemberHours(member.id),
    member.status === "active" ? getMyPairing(member.id, month) : Promise.resolve(null),
    member.status === "active" ? getMyAvailability(member.id, month) : Promise.resolve(null),
  ]);

  const [mySubmission, partnerNames, sharedSlots] = await Promise.all([
    session ? getMySubmission(member.id, session.id) : Promise.resolve(null),
    pairing?.partnerId ? resolveNames([pairing.partnerId]) : Promise.resolve(new Map<string, string>()),
    pairing ? getSharedSlots(pairing.id) : Promise.resolve([] as string[]),
  ]);
  // Round 3, §B: a note from Nina the member hasn't opened yet.
  const myThread = mySubmission ? ((await getComments([mySubmission.id])).get(mySubmission.id) ?? []) : [];
  const ninaWaiting = hasUnseenCoachComment(mySubmission, myThread);

  const firstName = member.full_name.split(" ")[0];
  const signedOff = Boolean(submission?.submitted_at);
  const milestone = milestoneProgress(hours.total);

  // Hours reclaimed this month: the ledger weeks that start in this month.
  const thisMonth = today.slice(0, 7);
  const monthHours = hours.weeks
    .filter((w) => w.week_start_date.startsWith(thisMonth))
    .reduce((sum, w) => sum + w.hours, 0);

  // Weekly goals: roadmap actions ticked this week, of all of them.
  const ticked = Object.values(submission?.actions_taken ?? {}).filter(Boolean).length;
  const goalCount = roadmapItems.length;

  // The task list. Only what genuinely needs doing now.
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const fridayOn = dow === 5 || dow === 6 || dow === 0;
  const tasks: { key: string; title: string; detail: string; href: string; flag?: boolean }[] = [];
  // Nina's note comes first: it is the one thing on the list that is a person
  // waiting on them (round 3, §B).
  if (ninaWaiting) {
    tasks.push({
      key: "hot-seat-note",
      title: "Nina's left a comment on your hot seat",
      detail: "Go and review it before the call. You can reply.",
      href: "/hot-seat",
      flag: true,
    });
  }
  if (!signedOff && fridayOn) {
    tasks.push({
      key: "log",
      title: "Sign off this week's log",
      detail: "Tick what you did against the plan, and answer the Friday question.",
      href: "/log",
    });
  }
  if (availability && !availability.submitted) {
    tasks.push({
      key: "pairing",
      title: "Pick when you're free for your peer call",
      detail: pairing
        ? "Real dates and times. The moment you've both picked, you'll both hear where you overlap."
        : "Real dates and times, the more the better. You'll be paired by rotation.",
      href: "/pairing",
    });
  }
  if (session && member.status === "active" && !mySubmission?.submitted_at) {
    tasks.push({
      key: "hot-seat",
      title: "Submit your hot seat",
      detail: session.scheduled_for
        ? `Before ${formatSessionTime(session.scheduled_for)}.`
        : "What you're stuck on, and what done looks like.",
      href: "/hot-seat",
    });
  }
  if (session?.scheduled_for) {
    // The session's own time, said as such: on its own it read as a deadline
    // for adding it (round 4, item 9).
    tasks.push({
      key: "calendar",
      title: "Add the next hot seat to your calendar",
      detail: `The session is ${formatSessionTime(session.scheduled_for)}. One tap adds it.`,
      href: `/api/calendar/hot-seat/${session.id}`,
    });
  }

  const partnerName = pairing?.partnerId ? (partnerNames.get(pairing.partnerId) ?? "your partner") : null;
  const partnerFirst = partnerName?.split(" ")[0] ?? "them";
  // The pairing card's second line, in step with the pairing page's own.
  const pairingLine = pairing?.metAt
    ? "Met this month."
    : pairing?.bookedAt
      ? "Call's in the diary."
      : pairing?.overlapCheckedAt
        ? sharedSlots[0]
          ? `You're both free ${slotLabelShort(sharedSlots[0])}. Message ${partnerFirst} to confirm.`
          : `No time you're both free yet. Message ${partnerFirst} to work one out.`
        : availability?.submitted
          ? `Once ${partnerFirst} has picked too, you'll both hear where you overlap.`
          : "Pick when you're free, and you'll both hear where you overlap.";

  return (
    <main className="flex-1 py-6 sm:py-10">
      <Eyebrow>{LONG_DATE.format(new Date())}</Eyebrow>
      <h1 className="font-display mt-2 text-display font-medium text-ink">
        {greeting()}, {firstName}.
      </h1>

      {/* 1. Onboarding — while any of the six is left. Not gated on status. */}
      {!onboardingProgress.allDone ? (
        <div className="mt-6">
          <OnboardingPath progress={onboardingProgress} compact />
        </div>
      ) : null}

      {/* 3 (over 2). The quote of the day on a plain orange block, and the
          metrics strip at its foot. Not a photograph: the rotating station
          image was never approved and read as a random background (Dom, 14
          Sep). Brand colour only. */}
      <section className="relative mt-6 overflow-hidden rounded-card bg-orange shadow-lift">
        <div className="p-5 pb-28 sm:p-7 sm:pb-32">
          <Quote className="max-w-md text-[1.35rem] text-ink sm:text-heading">
            &ldquo;{quoteOfTheDay()}&rdquo;
          </Quote>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small text-ink/80">
            {roadmap?.focusStation ? (
              <Link
                href={`/stations/${roadmap.focusStation.slug}`}
                className="underline decoration-ink/40 decoration-2 underline-offset-4 hover:decoration-ink"
              >
                This month: {roadmap.focusStation.name} →
              </Link>
            ) : null}
            {/* La Strada, the roadmap page, since 18 Sep. */}
            <Link
              href="/roadmap"
              className="underline decoration-ink/40 decoration-2 underline-offset-4 hover:decoration-ink"
            >
              Your roadmap →
            </Link>
          </p>
        </div>

        {/* 2. The metrics strip. On a flat colour the glass is a plain cream
            card — the blur variable only matters over imagery. */}
        <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2 sm:inset-x-5 sm:bottom-5">
          {[
            { value: `${formatHours(monthHours)}h`, label: "reclaimed this month", href: "/milestones" },
            { value: goalCount > 0 ? `${ticked}/${goalCount}` : ", ", label: "weekly goals", href: "/log" },
            // Weekly check-ins signed off this month (round 4, item 8): replaced
            // "upcoming sessions", which was the same number for everyone.
            { value: String(checkIns), label: checkIns === 1 ? "check-in this month" : "check-ins this month", href: "/log" },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-2xl bg-cream px-3 py-3 text-center shadow-soft transition hover:bg-card sm:px-4"
            >
              <p className="font-mono text-heading text-ink tabular-nums sm:text-title">{stat.value}</p>
              <p className="mt-0.5 text-[0.62rem] leading-tight font-medium tracking-wide text-ink/60 uppercase sm:text-eyebrow">
                {stat.label}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. The task list. */}
      <SectionTitle className="mt-8" aside={tasks.length ? `${tasks.length} to do` : undefined}>
        Today
      </SectionTitle>
      {tasks.length === 0 ? (
        <Card>
          <p className="text-small text-ink/70">
            Nothing waiting on you. Start the timer when you begin something.
          </p>
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-ink/6 p-2">
            {tasks.map((task) => (
              <li key={task.key}>
                <Link
                  href={task.href}
                  className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 transition hover:bg-cream-deep ${
                    task.flag ? "bg-lemon/30" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-5 shrink-0 rounded-full border-2 ${task.flag ? "border-orange bg-orange" : "border-ink/25"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-ink">{task.title}</span>
                    <span className="mt-0.5 block text-caption text-ink/55">{task.detail}</span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 5. The three cards that lost a nav slot. Real routes in. */}
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Card tone="dark" className="flex flex-col">
          <Eyebrow tone="light">Your hot seat this month</Eyebrow>
          {/* This member's own submission for the upcoming session, in its
              actual state (round-2 brief, C7). Four honest states, none of
              them blank, none of them generic. */}
          {!session ? (
            <p className="mt-2 text-small text-white/75">
              No session scheduled this month yet. Nina sets the date; it will show here.
            </p>
          ) : mySubmission?.confirmed_at && mySubmission.confirmed_challenge ? (
            <>
              <p className="font-display mt-2 text-heading font-medium">
                {mySubmission.confirmed_challenge}
              </p>
              <p className="mt-1 text-small text-white/70">
                Confirmed{session.scheduled_for ? ` for ${formatSessionTime(session.scheduled_for)}` : ""}.
              </p>
            </>
          ) : mySubmission?.submitted_at ? (
            <>
              <p className="mt-2 text-small text-white/90">
                {ninaWaiting
                  ? "Nina's left you a note. Read it before the call."
                  : "Submitted. Nina confirms what gets built before the session."}
              </p>
              {mySubmission.challenge ? (
                <p className="mt-2 text-small text-white/65 italic">&ldquo;{mySubmission.challenge}&rdquo;</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-small text-white/75">
              Nothing submitted yet
              {session.scheduled_for ? ` for ${formatSessionTime(session.scheduled_for)}` : " for this month's session"}.
              Say what you&rsquo;re stuck on and what done looks like.
            </p>
          )}
          <div className="mt-auto pt-5">
            <ButtonLink href="/hot-seat" variant="primary" size="sm">
              {member.status === "active" ? "The hot seat" : "What happens"}
            </ButtonLink>
          </div>
        </Card>

        <Card className="flex flex-col">
          <Eyebrow>Hours reclaimed</Eyebrow>
          <p className="font-mono mt-2 text-title text-ink">{formatHours(hours.total)}</p>
          <p className="mt-1 text-small text-ink/65">
            {milestone.next === null
              ? "Every milestone passed."
              : `${milestone.toNext} to your next milestone at ${milestone.next}.`}
          </p>
          <div className="mt-auto pt-5">
            <ButtonLink href="/milestones" variant="secondary" size="sm">
              See the path
            </ButtonLink>
          </div>
        </Card>

        <Card className="flex flex-col">
          <Eyebrow>Peer pairing</Eyebrow>
          {partnerName ? (
            <>
              <p className="font-display mt-2 text-heading font-medium text-ink">{partnerName}</p>
              <p className="mt-1 text-small text-ink/65">{pairingLine}</p>
            </>
          ) : (
            <p className="mt-2 text-small text-ink/65">
              {member.status === "active"
                ? availability?.submitted
                  ? "You've picked your times. Pairings go out by rotation."
                  : "Pick when you're free, and you'll be paired by rotation."
                : "Opens once you're active."}
            </p>
          )}
          <div className="mt-auto pt-5">
            <ButtonLink href="/pairing" variant="secondary" size="sm">
              Pairing
            </ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <InstallPrompt />
      </div>
    </main>
  );
}
