import { Card, SectionTitle } from "@/components/ui/card";
import { launch as launchFormulas } from "@/lib/reporting/formulas";

/**
 * §6.6's planner: working backwards from a sales goal.
 *
 * Sales goal ÷ conversion rate gives the SIGN-UPS needed; those × the
 * show-up rate give the people expected in the room. **Rounded up at
 * both steps**, because half a person does not attend anything.
 *
 * **It ran the other way round until 29 October**, and that was the bug
 * worth the most: decision 20 made conversion sales ÷ sign-ups, so
 * dividing the goal by it gives sign-ups directly. Left alone, the
 * planner and the launch report would have printed two different
 * conversion rates for the same launch, each internally consistent.
 * Caught by Dom reading the screenshots.
 *
 * Sign-ups lead now, because they are what the plan asks somebody to go
 * and get. The room is what follows from them.
 *
 * The team's panel, not the client's. It is a planning tool for the
 * conversation, and a client looking at "you need 600 sign-ups" without
 * that conversation is being handed a number, not a plan.
 */
export function LaunchPlanner({
  goal,
  showUpRate,
  conversionRate,
  className = "",
}: {
  goal: number | null;
  showUpRate: number | null;
  conversionRate: number | null;
  className?: string;
}) {
  const { liveAttendeesNeeded, signUpsNeeded } = launchFormulas.planner({
    salesGoal: goal,
    conversionRatePercent: conversionRate,
    showUpRatePercent: showUpRate,
  });

  const missing = [
    goal === null ? "a sales goal" : null,
    conversionRate === null ? "a conversion rate" : null,
    showUpRate === null ? "a show-up rate" : null,
  ].filter((m): m is string => m !== null);

  return (
    <Card className={className}>
      <SectionTitle>Working backwards</SectionTitle>

      {missing.length > 0 ? (
        <p className="text-body text-ink/70">
          Set {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} and this
          works out how many people need to turn up, and how many need to
          sign up for that.
        </p>
      ) : (
        <>
          <p className="text-body text-ink/70">
            To sell <span className="font-mono text-ink">{goal}</span> at{" "}
            <span className="font-mono text-ink">{conversionRate}%</span> conversion
            and <span className="font-mono text-ink">{showUpRate}%</span> show-up:
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-cream-deep px-4 py-3">
              <dt className="text-caption uppercase tracking-wide text-ink/55">
                Sign-ups needed
              </dt>
              <dd className="font-mono text-heading text-ink">
                {signUpsNeeded?.toLocaleString("en-GB") ?? "—"}
              </dd>
            </div>
            <div className="rounded-xl bg-cream-deep px-4 py-3">
              <dt className="text-caption uppercase tracking-wide text-ink/55">
                Expected in the room
              </dt>
              <dd className="font-mono text-heading text-ink">
                {liveAttendeesNeeded?.toLocaleString("en-GB") ?? "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-caption text-ink/50">
            Conversion is measured against sign-ups, so that is what the goal
            divides into. Rounded up at both steps — half a person does not
            attend anything.
          </p>
        </>
      )}
    </Card>
  );
}
