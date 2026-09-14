import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { asJourneyOrder, getMemberHours } from "@/lib/hours/queries";
import { formatHours, milestoneJourney, milestoneProgress } from "@/lib/hours/milestones";
import { formatCalendarDate } from "@/lib/time-zone";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { MilestonePath } from "@/components/milestones/milestone-path";

export const metadata: Metadata = { title: "Your milestones · aOS" };

/**
 * The full milestone path (§2's click-through from Piazza's compact line).
 *
 * **The illustration landed 8 September**, in the pass that followed the La
 * Strada redraw, as intended. The road runs down the coast with the five
 * thresholds on it and the travelled stretch picked out; underneath it, the same
 * five as a list, because the list carries what the picture can't — the week
 * each one was crossed.
 *
 * Zero hours is the top of the road and progress runs downward, so a member sees
 * where they are without scrolling and scrolls to see what is ahead.
 *
 * That last part is what makes this worth a page rather than a bigger progress
 * bar. "You passed fifty in the week of 9 March" is a different thing to say
 * than "you're 62% of the way to a hundred", and the append-only ledger is what
 * makes it answerable — a rate retired in June doesn't move when March happened.
 *
 * Nothing here claims a milestone unlocks anything. §2 uses the word "unlock"
 * but never says what is unlocked, and a page promising a reward that doesn't
 * exist is worse than one that just says how far you've come.
 *
 * **Rewards are intended, though — deferred, not dropped.** Real unlockable
 * things at each threshold are wanted eventually and aren't scoped yet. When
 * they are, this page is where they belong: the thresholds, the dates and the
 * bands are already here, and a reward hangs off a step rather than replacing
 * anything. See the state doc's deferred-decisions section.
 */
export default async function MilestonesPage() {
  const member = (await getCurrentMember())!;
  const hours = await getMemberHours(member.id);
  const journey = milestoneJourney(asJourneyOrder(hours.weeks));
  const progress = milestoneProgress(journey.total);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/piazza"
          className="text-small text-ink/70 underline underline-offset-4 transition hover:text-ink"
        >
          ← Piazza
        </Link>
      </p>

      <PageHeader
        eyebrow="Hours reclaimed"
        title="How far you've come"
        intro="Every week a build of yours is live, it gives you time back. This is the distance travelled. It only ever goes up."
      />

      <Card className="mb-6 bg-sky/15">
        <Eyebrow>Total</Eyebrow>
        <p className="font-mono mt-1 text-title text-ink">
          {formatHours(journey.total)} hrs
        </p>
        {hours.weeklyRate > 0 ? (
          <p className="mt-2 text-small text-ink/70">
            Your builds add{" "}
            <span className="font-mono">{formatHours(hours.weeklyRate)} hrs</span>{" "}
            every week it's live.
          </p>
        ) : null}
      </Card>

      <h2 className="font-display mb-3 text-heading font-medium text-ink">
        The path
      </h2>

      <MilestonePath hours={journey.total} steps={journey.steps} />

      <ol className="mb-8 flex flex-col gap-3">
        {journey.steps.map((step, index) => {
          const previous = index === 0 ? 0 : journey.steps[index - 1].target;
          const isNext = !step.reached && step.target === progress.next;
          const bandFraction = step.reached
            ? 1
            : Math.min(
                1,
                Math.max(0, (journey.total - previous) / (step.target - previous)),
              );

          return (
            <li key={step.target}>
              <Card
                className={
                  step.reached
                    ? "border-gold/50 bg-lemon/25"
                    : isNext
                      ? "border-ink/25"
                      : ""
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-mono text-heading text-ink">
                    {step.target} hrs
                  </p>
                  {step.reached ? (
                    <p className="text-small text-ink/70">
                      {step.reachedInWeek
                        ? `Passed in the week of ${formatCalendarDate(step.reachedInWeek)}`
                        : "Passed"}
                    </p>
                  ) : (
                    <p className="text-small text-ink/60">
                      {step.toGo} to go
                    </p>
                  )}
                </div>

                {/* The band between the previous threshold and this one, so the
                    last stretch to 750 doesn't look static for months. */}
                {!step.reached ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-orange"
                      style={{ width: `${Math.round(bandFraction * 100)}%` }}
                    />
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>

      <h2 className="font-display mb-3 text-heading font-medium text-ink">
        Week by week
      </h2>

      {journey.weeks.length === 0 ? (
        <Card>
          <p className="text-small text-ink/70">
            Nothing banked yet. Hours start accruing from the first full week a
            build of yours is live.
          </p>
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-ink/10">
            {[...journey.weeks].reverse().map((week) => (
              <li
                key={week.weekStartDate}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
              >
                <span className="text-small text-ink/70">
                  Week of {formatCalendarDate(week.weekStartDate)}
                </span>
                <span className="font-mono text-small text-ink tabular-nums">
                  {week.hours > 0 ? `+${formatHours(week.hours)}` : ", "}
                  <span className="text-ink/40">
                    {" "}
                    · {formatHours(week.runningTotal)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
