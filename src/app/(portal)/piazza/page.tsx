import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { currentWeekStart, getRoadmapItems, getWeeklySubmission } from "@/lib/log/queries";
import { countUpcomingSessions, getCurrentChallenge, getMySubmission, getUpcomingSession } from "@/lib/hot-seat/queries";
import { getPiazzaRoadmap } from "@/lib/piazza/queries";
import { quoteOfTheDay } from "@/lib/piazza/quotes";
import { getMemberHours } from "@/lib/hours/queries";
import { formatHours, milestoneProgress } from "@/lib/hours/milestones";
import { getMyAvailability, getMyPairing, pairingMonth } from "@/lib/pairing/queries";
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
    sessionCount,
    challenge,
    roadmap,
    hours,
    pairing,
    availability,
  ] = await Promise.all([
    getOnboardingProgress(member),
    getWeeklySubmission(member.id, weekStart),
    getRoadmapItems(member.id),
    getUpcomingSession(),
    countUpcomingSessions(),
    getCurrentChallenge(member.id),
    getPiazzaRoadmap(member.id),
    getMemberHours(member.id),
    member.status === "active" ? getMyPairing(member.id, month) : Promise.resolve(null),
    member.status === "active" ? getMyAvailability(member.id, month) : Promise.resolve(null),
  ]);

  const [mySubmission, partnerNames] = await Promise.all([
    session ? getMySubmission(member.id, session.id) : Promise.resolve(null),
    pairing?.partnerId ? resolveNames([pairing.partnerId]) : Promise.resolve(new Map<string, string>()),
  ]);

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
  const tasks: { key: string; title: string; detail: string; href: string }[] = [];
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
      title: "Say when you're free for your peer call",
      detail: "About ten seconds. It's what gets you matched.",
      href: "/pairing",
    });
  }
  if (session && member.status === "active" && !mySubmission) {
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
    tasks.push({
      key: "calendar",
      title: "Add the next hot seat to your calendar",
      detail: formatSessionTime(session.scheduled_for),
      href: `/api/calendar/hot-seat/${session.id}`,
    });
  }

  const partnerName = pairing?.partnerId ? (partnerNames.get(pairing.partnerId) ?? "your partner") : null;

  return (
    <main className="flex-1 py-6 sm:py-10">
      <Eyebrow>{LONG_DATE.format(new Date())}</Eyebrow>
      <h1 className="font-display mt-2 text-display font-medium text-ink">
        Buongiorno, {firstName}.
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
            {/* The roadmap's route in from Piazza (brief C6). Its home is the
                Log's sign-off checklist until the full screen exists. */}
            <Link
              href="/log"
              className="underline decoration-ink/40 decoration-2 underline-offset-4 hover:decoration-ink"
            >
              Your roadmap and log →
            </Link>
          </p>
        </div>

        {/* 2. The metrics strip. On a flat colour the glass is a plain cream
            card — the blur variable only matters over imagery. */}
        <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2 sm:inset-x-5 sm:bottom-5">
          {[
            { value: `${formatHours(monthHours)}h`, label: "reclaimed this month", href: "/milestones" },
            { value: goalCount > 0 ? `${ticked}/${goalCount}` : ", ", label: "weekly goals", href: "/log" },
            { value: String(sessionCount), label: sessionCount === 1 ? "upcoming session" : "upcoming sessions", href: "/hot-seat" },
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
                  className="flex items-center gap-4 rounded-2xl px-4 py-3.5 transition hover:bg-cream-deep"
                >
                  <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-ink/25" />
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
          <Eyebrow tone="light">The hot seat</Eyebrow>
          {challenge ? (
            <p className="font-display mt-2 text-heading font-medium">{challenge}</p>
          ) : session?.scheduled_for ? (
            <p className="font-display mt-2 text-heading font-medium">
              {formatSessionTime(session.scheduled_for)}
            </p>
          ) : (
            <p className="mt-2 text-small text-white/70">
              Next session not scheduled yet.
            </p>
          )}
          {challenge && session?.scheduled_for ? (
            <p className="mt-1 text-small text-white/70">{formatSessionTime(session.scheduled_for)}</p>
          ) : null}
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
              <p className="mt-1 text-small text-ink/65">
                {pairing?.metAt ? "Met this month." : pairing?.bookedAt ? "Call's in the diary." : "This month's pair."}
              </p>
            </>
          ) : (
            <p className="mt-2 text-small text-ink/65">
              {member.status === "active"
                ? availability?.submitted
                  ? "You're in for this month. Pairings go out soon."
                  : "Say when you're free and you'll be matched."
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
