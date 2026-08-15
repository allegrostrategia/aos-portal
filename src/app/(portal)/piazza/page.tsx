import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/member";
import { Card, Eyebrow, Stat } from "@/components/ui/card";
import { getThisWeekTotal } from "@/lib/timer/queries";
import { formatMinutes } from "@/lib/timer/format";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Piazza — aOS",
};

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Placeholder. The real Piazza — the proof cluster, this week's log, the mini La
 * Strada map, the draw card, today's priorities — is Step 4. This exists so
 * there's somewhere to land after signing in, now dressed in the design system
 * so Step 4 starts from the right vocabulary rather than reinventing it.
 */
export default async function PiazzaPage() {
  // Non-null: the portal layout has already run requireMember().
  const member = (await getCurrentMember())!;
  // §3: Piazza shows the timer shortcut and today's logged time at a glance.
  const week = await getThisWeekTotal(member.id);

  const firstName = member.full_name.split(" ")[0];

  return (
    <main className="flex-1 py-8 sm:py-10">
      <Eyebrow>{LONG_DATE.format(new Date())}</Eyebrow>
      <h1 className="font-display mt-2 text-display text-navy italic">
        Buongiorno, {firstName}
      </h1>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Card>
          <Eyebrow>Your stage</Eyebrow>
          <p className="font-display mt-2 text-heading text-navy italic">
            {member.status === "onboarding" ? "Onboarding" : "Active"}
          </p>
          <p className="mt-2 text-small text-navy/70">
            {member.status === "onboarding"
              ? "Time tracking, your audit and the member directory are open to you now. The full library, hot seat and peer pairing unlock once you’re active."
              : "Everything is open to you — the full library, hot seat and peer pairing."}
          </p>
          <ButtonLink
            href={member.status === "onboarding" ? "/onboarding" : "/stations"}
            size="sm"
            className="mt-4"
          >
            {member.status === "onboarding"
              ? "Your first weeks"
              : "Walk La Strada"}
          </ButtonLink>
        </Card>

        <Card>
          <Eyebrow>This week&rsquo;s log</Eyebrow>
          <p className="font-mono mt-2 text-title text-navy tabular-nums">
            {formatMinutes(week.loggedMinutes)}
          </p>
          <p className="mt-2 text-small text-navy/70">
            {week.isCompleteWeek
              ? "Ten hours in — this week counts."
              : "Ten hours makes a week count. Start the timer when you begin something."}
          </p>
          <ButtonLink href="/log" size="sm" variant="secondary" className="mt-4">
            Your log
          </ButtonLink>
        </Card>

        <Card>
          <Stat
            label="Member since"
            value={MONTH_YEAR.format(new Date(member.join_date))}
            detail={
              member.contract_term_end_date
                ? `Your first six months run to ${FULL_DATE.format(
                    new Date(member.contract_term_end_date),
                  )}.`
                : undefined
            }
          />
        </Card>
      </div>

      <p className="mt-8 text-small text-navy/50">
        Piazza proper — hours reclaimed, this week&rsquo;s log, your challenge and
        the map — arrives in Step 4.
      </p>
    </main>
  );
}
