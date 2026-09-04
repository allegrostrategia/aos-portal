import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { asJourneyOrder, getMemberHours } from "@/lib/hours/queries";
import { formatHours, milestoneJourney, milestoneProgress } from "@/lib/hours/milestones";
import { formatCalendarDate } from "@/lib/time-zone";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Your milestones — aOS" };

/**
 * The full milestone path (§2's click-through from Piazza's compact line).
 *
 * **Structure and mechanics only — the illustration comes later**, in a pass
 * alongside a La Strada refresh so both illustrated screens can be judged
 * together. What's here is the shape that artwork will hang on: four thresholds
 * in order, where the member is between them, and the week each was crossed.
 *
 * That last part is what makes this worth a page rather than a bigger progress
 * bar. "You passed fifty in the week of 9 March" is a different thing to say
 * than "you're 62% of the way to a hundred", and the append-only ledger is what
 * makes it answerable — a rate retired in June doesn't move when March happened.
 *
 * Nothing here claims a milestone unlocks anything. §2 uses the word "unlock"
 * but never says what is unlocked, and a page promising a reward that doesn't
 * exist is worse than one that just says how far you've come.
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
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Piazza
        </Link>
      </p>

      <PageHeader
        eyebrow="Hours reclaimed"
        title="How far you've come"
        intro="Every week you log ten hours and submit, the builds you've made give you time back. This is the distance travelled — it only ever goes up."
      />

      <Card className="mb-6 bg-sky/15">
        <Eyebrow>Total</Eyebrow>
        <p className="font-mono mt-1 text-title text-navy">
          {formatHours(journey.total)} hrs
        </p>
        {hours.weeklyRate > 0 ? (
          <p className="mt-2 text-small text-navy/70">
            Your builds add{" "}
            <span className="font-mono">{formatHours(hours.weeklyRate)} hrs</span>{" "}
            every qualifying week.
          </p>
        ) : null}
      </Card>

      <h2 className="font-display mb-3 text-heading text-navy italic">
        The path
      </h2>

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
                      ? "border-navy/25"
                      : ""
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-mono text-heading text-navy">
                    {step.target} hrs
                  </p>
                  {step.reached ? (
                    <p className="text-small text-navy/70">
                      {step.reachedInWeek
                        ? `Passed in the week of ${formatCalendarDate(step.reachedInWeek)}`
                        : "Passed"}
                    </p>
                  ) : (
                    <p className="text-small text-navy/60">
                      {step.toGo} to go
                    </p>
                  )}
                </div>

                {/* The band between the previous threshold and this one, so the
                    last stretch to 500 doesn't look static for months. */}
                {!step.reached ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy/10">
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

      <h2 className="font-display mb-3 text-heading text-navy italic">
        Week by week
      </h2>

      {journey.weeks.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            Nothing banked yet. Hours start accruing from the first week you log
            ten hours and submit, once a build of yours is live.
          </p>
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-navy/10">
            {[...journey.weeks].reverse().map((week) => (
              <li
                key={week.weekStartDate}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
              >
                <span className="text-small text-navy/70">
                  Week of {formatCalendarDate(week.weekStartDate)}
                </span>
                <span className="font-mono text-small text-navy tabular-nums">
                  {week.hours > 0 ? `+${formatHours(week.hours)}` : "—"}
                  <span className="text-navy/40">
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
