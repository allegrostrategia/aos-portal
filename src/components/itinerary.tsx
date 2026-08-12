import { buildItinerary, type IsoDate } from "@/lib/onboarding/cadence";
import { Eyebrow } from "@/components/ui/card";

/**
 * The itinerary (§1).
 *
 * "Styled like an old-world travel itinerary or ticket, not a plain calendar
 * export, so it sits inside the world rather than outside it." Hence the perfed
 * edge, the ruled rows and the mono dates — a ticket rather than a table.
 *
 * Shows weeks, not appointment times. The hot seat schedule doesn't exist yet
 * (Step 6) and the 1:1 is arranged with Nina directly, so a precise time here
 * would be invented. Week-beginning dates are true now and stay true.
 */

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});

const WEEK_OF = (iso: IsoDate) => `Week of ${DAY.format(new Date(iso))}`;

function Row({
  stage,
  when,
  what,
}: {
  stage: string;
  when: string;
  what: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-navy/10 py-3 first:border-t-0">
      <span className="font-mono w-24 shrink-0 text-eyebrow text-orange uppercase">
        {stage}
      </span>
      <span className="font-mono min-w-40 flex-1 text-small text-navy">
        {when}
      </span>
      <span className="w-full text-small text-navy/70 sm:w-auto sm:flex-2">
        {what}
      </span>
    </li>
  );
}

export function Itinerary({
  onboardingStartDate,
}: {
  onboardingStartDate: IsoDate;
}) {
  const it = buildItinerary(onboardingStartDate);

  return (
    <div className="overflow-hidden rounded-xl border border-navy/15 bg-lemon/25">
      <div className="border-b border-dashed border-navy/25 px-5 py-4 sm:px-6">
        <Eyebrow tone="accent">Grand Hotel Riposo</Eyebrow>
        <h2 className="font-display mt-1 text-title text-navy italic">
          Your itinerary
        </h2>
        <p className="mt-2 text-small text-navy/70">
          Your actual dates, not a generic calendar.
        </p>
      </div>

      <ol className="px-5 py-2 sm:px-6">
        <Row
          stage="Day one"
          when={DAY.format(new Date(it.welcomeDate))}
          what="Welcome session, and this itinerary."
        />
        <Row
          stage="Tracking I"
          when={WEEK_OF(it.trackingWeekOne)}
          what="Start logging your time as you go, not from memory."
        />
        <Row
          stage="Tracking II"
          when={WEEK_OF(it.trackingWeekTwo)}
          what="A second week, so the picture is a pattern rather than a snapshot."
        />
        <Row
          stage="Your 1:1"
          when={WEEK_OF(it.oneToOneWeek)}
          what="An hour with Nina, and your roadmap. She'll confirm the time with you."
        />
        <Row
          stage="Hot seat"
          when={WEEK_OF(it.firstHotSeatWeek)}
          what="Your first live build, alongside everyone else."
        />
      </ol>

      {/* §1: a short, light-touch note on what happens if a step is missed, so
          it isn't a silent unknown. */}
      <div className="border-t border-dashed border-navy/25 px-5 py-4 text-small text-navy/70 sm:px-6">
        <p>
          Miss a tracking week and nothing breaks — your roadmap is simply built
          on less. Miss the 1:1 and Nina will find you another slot; it&rsquo;s
          the one date worth protecting, because everything after it is shaped by
          that conversation.
        </p>
        {it.joinedOffCycle ? (
          <p className="mt-3 text-navy/60">
            Your start date falls outside the usual week-2 intake, so these dates
            are indicative — Nina will confirm them with you.
          </p>
        ) : null}
      </div>
    </div>
  );
}
