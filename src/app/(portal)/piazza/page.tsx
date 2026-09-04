import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { getThisWeekTotal, COMPLETE_WEEK_MINUTES } from "@/lib/timer/queries";
import { formatMinutes, weekProgress } from "@/lib/timer/format";
import { currentWeekStart, getWeeklySubmission } from "@/lib/log/queries";
import { getCurrentChallenge, getUpcomingSession } from "@/lib/hot-seat/queries";
import { getPiazzaRoadmap } from "@/lib/piazza/queries";
import { getMemberHours } from "@/lib/hours/queries";
import { formatHours, milestoneProgress } from "@/lib/hours/milestones";
import { formatSessionTime } from "@/lib/time-zone";
import { Card, Eyebrow } from "@/components/ui/card";
import { InstallPrompt } from "@/components/install-prompt";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Piazza — aOS" };

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Piazza — the daily homepage (§2).
 *
 * "I'm arriving at my business today," not "I've opened an app." Calm, not
 * overwhelming — which is as much about what isn't here as what is.
 *
 * Widgets whose data doesn't exist yet are omitted rather than shown empty. The
 * buddy card needs pairing (Step 11), and the draw card needs a draw to exist.
 * An empty widget takes the same room as a full one and says less — which is why
 * the proof cluster appears only once there are hours in the ledger: "0 hrs
 * reclaimed" is a worse thing to greet somebody with every morning than nothing
 * at all, and in their first weeks it is also just true and unhelpful.
 *
 * The community goal from §2 is deliberately absent. The brief asks for the
 * collective number beside the personal one but never says what it counts
 * towards, and a made-up target shown as if it meant something is worse than
 * waiting for a real one.
 *
 * The map appears only as a preview (§3): Piazza should never show the full
 * thing, so La Strada stays somewhere members visit rather than get routed
 * through on every login.
 */
export default async function PiazzaPage() {
  // Non-null: the portal layout has already run requireMember().
  const member = (await getCurrentMember())!;
  const weekStart = currentWeekStart();

  const [week, submission, session, challenge, roadmap] = await Promise.all([
    getThisWeekTotal(member.id),
    getWeeklySubmission(member.id, weekStart),
    getUpcomingSession(),
    getCurrentChallenge(member.id),
    getPiazzaRoadmap(member.id),
  ]);

  const firstName = member.full_name.split(" ")[0];
  const signedOff = Boolean(submission?.submitted_at);
  const progress = weekProgress(week.loggedMinutes, COMPLETE_WEEK_MINUTES);
  const onboarding = member.status === "onboarding";

  const hours = await getMemberHours(member.id);
  const milestone = milestoneProgress(hours.total);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <Eyebrow>{LONG_DATE.format(new Date())}</Eyebrow>
      <h1 className="font-display mt-2 text-display text-navy italic">
        Buongiorno, {firstName}
      </h1>
      <p className="mt-3 max-w-xl text-body text-navy/70">
        One real thing, built every month, from what your own week actually
        shows.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {/* This week's log, with the FATTO stamp on completion (§2). */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow>This week&rsquo;s log</Eyebrow>
              <p className="font-mono mt-2 text-title text-navy tabular-nums">
                {formatMinutes(week.loggedMinutes)}
              </p>
            </div>
            {signedOff ? (
              // Rotated and bordered — a stamp pressed onto the page rather
              // than a tidy status badge. §2 asks for a stamp; a pill would be
              // a different gesture.
              <span className="font-display shrink-0 -rotate-6 rounded border-2 border-orange/60 px-2 py-1 text-heading text-orange/80 italic">
                Fatto
              </span>
            ) : null}
          </div>

          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-navy/10"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress toward a complete week"
          >
            <div
              className={`h-full rounded-full transition-all ${
                week.isCompleteWeek ? "bg-navy" : "bg-orange"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-2 text-small text-navy/70">
            {signedOff
              ? "Signed off. Your time keeps tracking."
              : week.isCompleteWeek
                ? "Ten hours in — sign the week off when you're ready."
                : `${formatMinutes(COMPLETE_WEEK_MINUTES - week.loggedMinutes)} more makes it count.`}
          </p>

          <ButtonLink href="/log" size="sm" variant="secondary" className="mt-4">
            Your log
          </ButtonLink>
        </Card>

        {/* "Continue your journey" is a deep link into the station matching
            their focus, never a link to the map (§3). */}
        {roadmap?.focusStation ? (
          <Card>
            <Eyebrow>Continue your journey</Eyebrow>
            <p className="font-display mt-2 text-heading text-navy italic">
              {roadmap.focusStation.name}
            </p>
            {roadmap.phaseTitle ? (
              <p className="mt-1 text-small text-navy/60">
                {roadmap.phaseTitle}
              </p>
            ) : null}
            {roadmap.focusStation.description ? (
              <p className="mt-2 text-small text-navy/70">
                {roadmap.focusStation.description}
              </p>
            ) : null}
            <ButtonLink
              href={`/stations/${roadmap.focusStation.slug}`}
              size="sm"
              className="mt-4"
            >
              Go there
            </ButtonLink>
          </Card>
        ) : onboarding ? (
          <Card>
            <Eyebrow>Your first weeks</Eyebrow>
            <p className="mt-2 text-small text-navy/70">
              Your roadmap arrives at your 1:1 in week four. Until then the work
              is the tracking — it&rsquo;s what the roadmap gets built from.
            </p>
            <ButtonLink href="/onboarding" size="sm" className="mt-4">
              What&rsquo;s next
            </ButtonLink>
          </Card>
        ) : null}
      </div>

      {/* The one thing, from the hot seat (§4) — deliberately apart from the
          roadmap above, which is the separate self-paced track. */}
      {challenge ? (
        <Card className="mt-5 bg-lemon/25">
          <Eyebrow tone="accent">This month you&rsquo;re building</Eyebrow>
          <p className="font-display mt-2 text-title text-navy italic">
            {challenge}
          </p>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {session ? (
          <Card>
            <Eyebrow>Next hot seat</Eyebrow>
            <p className="font-display mt-2 text-heading text-navy italic">
              {session.scheduled_for
                ? formatSessionTime(session.scheduled_for)
                : "Week one — time to be confirmed"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <ButtonLink href="/hot-seat" size="sm" variant="secondary">
                {member.status === "active" ? "Submit yours" : "What happens"}
              </ButtonLink>
              {session.scheduled_for ? (
                <a
                  href={`/api/calendar/hot-seat/${session.id}`}
                  className="text-small text-navy/70 underline decoration-orange decoration-2 underline-offset-4 transition hover:text-navy"
                >
                  Add to calendar
                </a>
              ) : null}
            </div>
          </Card>
        ) : null}

        {roadmap && roadmap.openItems.length > 0 ? (
          <Card>
            <Eyebrow>On your roadmap</Eyebrow>
            <ul className="mt-2 flex flex-col gap-1.5">
              {roadmap.openItems.slice(0, 4).map((item) => (
                <li key={item} className="text-small text-navy/80">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-caption text-navy/50">
              Tick these off when you sign your week&rsquo;s log.
            </p>
          </Card>
        ) : null}
      </div>

      <Link
        href="/stations"
        className="group mt-5 block overflow-hidden rounded-xl border border-navy/10 bg-sky/10 transition hover:border-navy/25"
      >
        <div className="relative aspect-[21/9]">
          <Image
            src="/illustrations/la-strada-map.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="object-cover object-center transition duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="flex items-baseline justify-between gap-3 px-5 py-3">
          <p className="font-display text-heading text-navy italic">La Strada</p>
          <p className="text-small text-navy underline decoration-orange decoration-2 underline-offset-4">
            Open the map
          </p>
        </div>
      </Link>

      <InstallPrompt />

      {hours.total > 0 ? (
        /* The proof cluster (§2): the number, and how far to the next
           threshold. One block rather than three widgets, because milestones
           are thresholds of the same number rather than a separate idea. */
        <Card className="mt-5 bg-sky/15">
          <Eyebrow>Hours reclaimed</Eyebrow>
          <p className="font-mono mt-1 text-title text-navy">
            {formatHours(hours.total)}
          </p>

          {/* §2: compact here, click-through to the full path — the same
              pattern the draw card uses. */}
          <Link href="/milestones" className="mt-3 block">
            <div className="h-1.5 overflow-hidden rounded-full bg-navy/10">
              <div
                className="h-full rounded-full bg-orange"
                style={{ width: `${Math.round(milestone.fraction * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-small text-navy/70">
              {milestone.next === null
                ? "Every milestone passed."
                : `${milestone.toNext} to your next milestone at ${milestone.next}.`}{" "}
              <span className="text-navy underline decoration-orange decoration-2 underline-offset-4">
                See how far you&rsquo;ve come
              </span>
            </p>
          </Link>

          {hours.weeklyRate > 0 ? (
            <p className="mt-3 text-caption text-navy/60">
              Your builds add{" "}
              <span className="font-mono">{formatHours(hours.weeklyRate)} hrs</span>{" "}
              every week you log ten hours and submit.
            </p>
          ) : null}
        </Card>
      ) : (
        <p className="mt-8 text-small text-navy/50">
          Hours reclaimed, your milestones and the monthly draw arrive with the
          first builds.
        </p>
      )}
    </main>
  );
}
