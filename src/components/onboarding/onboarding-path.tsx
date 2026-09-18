import Link from "next/link";

import { setOnboardingStep } from "@/lib/onboarding/actions";
import type { OnboardingProgress } from "@/lib/onboarding/progress";
import { Card, Eyebrow } from "@/components/ui/card";

/**
 * The six steps as a numbered path — the reference's "Milestones" visual,
 * repurposed for onboarding (L'Editoriale §7). The real Milestones screen is
 * untouched.
 *
 * Rendered in two places: at the top of Piazza while anything is left to do,
 * and in full on /onboarding. Same component so the two can't disagree about
 * what's done.
 *
 * A step with no fact behind it in the product ("book your 1:1") is a
 * checkbox the member ticks. The others show what the product knows; a
 * tick on those is allowed too — the welcome watched on a call with Nina
 * still counts — but never overrides a fact that says done.
 */
export function OnboardingPath({
  progress,
  compact = false,
}: {
  progress: OnboardingProgress;
  compact?: boolean;
}) {
  const { steps, completeCount } = progress;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <Eyebrow tone="accent">Your onboarding steps</Eyebrow>
          <h2 className="font-display mt-1 text-heading font-medium text-ink">
            {completeCount === 0
              ? "Six steps to complete your onboarding"
              : `${completeCount} of ${steps.length} done`}
          </h2>
        </div>
        {compact ? (
          <Link href="/onboarding" className="text-small text-ink/60 underline underline-offset-4 hover:text-ink">
            All steps
          </Link>
        ) : null}
      </div>

      <ol className="mt-5 flex flex-col">
        {steps.map((step, i) => {
          const isNext = progress.next?.key === step.key;
          const last = i === steps.length - 1;
          // Compact: the next step in full, the others as a single line.
          const brief = compact && !isNext;

          return (
            <li key={step.key} className="relative flex gap-4">
              {/* The line down the left, from one number to the next. */}
              {!last ? (
                <span
                  aria-hidden
                  className={`absolute top-8 left-4 h-[calc(100%-1.25rem)] w-px -translate-x-1/2 ${
                    step.done ? "bg-orange" : "bg-ink/15"
                  }`}
                />
              ) : null}

              <span
                aria-hidden
                className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-small ${
                  step.done
                    ? "bg-orange text-white"
                    : isNext
                      ? "border-2 border-ink bg-card text-ink"
                      : step.locked
                        ? "border border-dashed border-ink/25 bg-card text-ink/40"
                        : "border border-ink/25 bg-card text-ink/50"
                }`}
              >
                {step.done ? "✓" : i + 1}
              </span>

              <div className={`min-w-0 flex-1 ${last ? "" : brief ? "pb-3" : "pb-5"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  {step.href && !step.done && !step.locked ? (
                    <Link
                      href={step.href}
                      className={`text-body font-medium text-ink underline-offset-4 hover:underline ${brief ? "text-small" : ""}`}
                    >
                      {step.title}
                    </Link>
                  ) : (
                    <p className={`text-body font-medium ${step.done ? "text-ink/60" : step.locked ? "text-ink/45" : "text-ink"} ${brief ? "text-small" : ""}`}>
                      {step.title}
                    </p>
                  )}
                  <span className="text-caption text-ink/50">
                    {step.done
                      ? "Complete"
                      : step.locked
                        ? "Locked"
                        : isNext
                          ? "In progress"
                          : step.href || step.tickable
                            ? "Ready when you are"
                            : "Later"}
                  </span>
                </div>

                {/* A locked step says what unlocks it (round 4, item 6). */}
                {!brief && step.locked && !step.done ? (
                  <p className="mt-1 text-caption text-ink/45">{step.locked}.</p>
                ) : null}

                {!brief ? (
                  <p className="mt-1 text-small text-ink/65">{step.description}</p>
                ) : null}

                {!brief && !step.done && step.pending ? (
                  <p className="mt-1 text-caption text-ink/45">{step.pending}. Carry on regardless.</p>
                ) : null}

                {!brief && step.tickable && !step.locked ? (
                  <form action={setOnboardingStep} className="mt-2">
                    <input type="hidden" name="step" value={step.key} />
                    <input type="hidden" name="done" value={step.done ? "false" : "true"} />
                    <button
                      type="submit"
                      className="text-caption text-ink/60 underline underline-offset-4 transition hover:text-ink"
                    >
                      {step.done ? "Untick" : step.key === "call" ? "I've booked it" : "I've done this"}
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
