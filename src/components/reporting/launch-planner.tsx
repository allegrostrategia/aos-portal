import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "./icons";
import type { PlannerFigures } from "@/lib/reporting/launch-figures";

/**
 * §6.6's planner, and Nina's item 5: working backwards from a sales
 * goal, then checking the launch against the plan.
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
 * **The client sees it now** (Nina, 19 November), where before it was
 * the team's panel alone. Her reason is the check underneath: a plan
 * nobody can see is not a plan anybody is held to, and "we assumed 5%
 * and you are running at 6.2%" is the conversation the panel is for.
 * Changing the rates is still an editor's job, which on a retainer
 * launch means Nina and on a self-serve one means the member — the same
 * line every other figure draws.
 *
 * **The show-up step disappears where there is nothing to turn up to.**
 * A waitlist-and-open-cart launch has no live event, so a room would be
 * a number about nothing.
 */

const BADGE = {
  "on-track": { text: "On track", className: "bg-sky/60 text-ink" },
  behind: { text: "Behind", className: "bg-blush/70 text-ink" },
} as const;

function Check({
  label,
  actual,
  assumed,
  verdict,
}: {
  label: string;
  actual: number | null;
  assumed: number | null;
  verdict: "on-track" | "behind" | null;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-ink/8 py-2.5 first:border-t-0">
      <span className="text-small text-ink/70">{label}</span>
      <span className="flex items-baseline gap-2 text-small">
        <span className="font-num text-ink">
          {actual === null ? "—" : `${Math.round(actual * 10) / 10}%`}
        </span>
        <span className="text-ink/45">
          against {assumed === null ? "—" : `${assumed}%`}
        </span>
        {verdict ? (
          <span
            className={`rounded-full px-2 py-0.5 text-caption font-medium ${BADGE[verdict].className}`}
          >
            {BADGE[verdict].text}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function LaunchPlanner({
  figures,
  canEdit,
  className = "",
}: {
  figures: PlannerFigures;
  /** Whether this reader is the one who can change the rates. */
  canEdit: boolean;
  className?: string;
}) {
  const {
    salesGoal,
    assumedConversion,
    assumedShowUp,
    signUpsNeeded,
    liveAttendeesNeeded,
    hasLiveEvent,
  } = figures;

  const missing = [
    salesGoal === null ? "a sales goal" : null,
    assumedConversion === null ? "a conversion rate" : null,
    hasLiveEvent && assumedShowUp === null ? "a show-up rate" : null,
  ].filter((m): m is string => m !== null);

  // Nothing to check until there is both a plan and a figure to hold it
  // against. Said as an absence rather than as a row of dashes.
  const checkable =
    figures.conversionCheck !== null ||
    figures.showUpCheck !== null ||
    figures.actualConversion !== null;

  return (
    <Card className={className}>
      <SectionTitle icon={<IconCircle name="target" tone="blush" />}>
        Working backwards
      </SectionTitle>

      {missing.length > 0 ? (
        <p className="text-body text-ink/70">
          Set {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} and this
          works out how many need to sign up
          {hasLiveEvent ? ", and how many of them to expect in the room" : ""}.
        </p>
      ) : (
        <>
          <p className="text-body text-ink/70">
            To sell <span className="font-num text-ink">{salesGoal}</span> at{" "}
            <span className="font-num text-ink">{assumedConversion}%</span> conversion
            {hasLiveEvent ? (
              <>
                {" "}
                and <span className="font-num text-ink">{assumedShowUp}%</span> show-up
              </>
            ) : null}
            :
          </p>
          <dl className={`mt-4 grid gap-4 ${hasLiveEvent ? "sm:grid-cols-2" : ""}`}>
            <div className="rounded-xl bg-cream-deep px-4 py-3">
              <dt className="text-caption uppercase tracking-wide text-ink/55">
                Sign-ups needed
              </dt>
              <dd className="font-num text-heading text-ink">
                {signUpsNeeded?.toLocaleString("en-GB") ?? "—"}
              </dd>
            </div>
            {hasLiveEvent ? (
              <div className="rounded-xl bg-cream-deep px-4 py-3">
                <dt className="text-caption uppercase tracking-wide text-ink/55">
                  Expected in the room
                </dt>
                <dd className="font-num text-heading text-ink">
                  {liveAttendeesNeeded?.toLocaleString("en-GB") ?? "—"}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-caption text-ink/50">
            Conversion is measured against sign-ups, so that is what the goal
            divides into. Rounded up at both steps — half a person does not
            attend anything.
          </p>
        </>
      )}

      {/* Her item 5's check. Below the plan, because it is the plan it
          is checking. */}
      {checkable ? (
        <div className="mt-5 border-t border-ink/8 pt-4">
          <p className="text-small font-medium text-ink">How it is going against that</p>
          <div className="mt-2 flex flex-col">
            <Check
              label="Conversion, sales ÷ sign-ups"
              actual={figures.actualConversion}
              assumed={assumedConversion}
              verdict={figures.conversionCheck}
            />
            {hasLiveEvent ? (
              <Check
                label="Show-up on the selling stage"
                actual={figures.actualShowUp}
                assumed={assumedShowUp}
                verdict={figures.showUpCheck}
              />
            ) : null}
          </div>
          <p className="mt-2 text-caption text-ink/50">
            {canEdit
              ? "The rates are our starting point — change them on the setup screen if this launch is a different shape."
              : "The rates are the ones we planned this launch against, so the comparison is to the plan rather than to an average."}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
