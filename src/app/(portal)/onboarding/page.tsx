import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { getOnboardingProgress } from "@/lib/onboarding/progress";
import { Itinerary } from "@/components/itinerary";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Your first weeks — aOS",
};

export default async function OnboardingPage() {
  const member = await requireMember();
  const { steps, completeCount, allDone } = await getOnboardingProgress(member);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Grand Hotel Riposo"
        title="Your first weeks"
        intro={
          allDone
            ? "That's everything. Keep logging your time — your roadmap gets built from it at your 1:1."
            : "Three things to do, in your own time. The rest of aOS opens up as you go."
        }
      />

      <p className="font-mono mb-4 text-eyebrow text-navy/50 uppercase">
        {completeCount} of {steps.length} done
      </p>

      <ol className="mb-8 flex flex-col gap-3">
        {steps.map((step, index) => {
          const inner = (
            <>
              <div className="flex items-baseline gap-3">
                <span
                  aria-hidden
                  className={`font-mono flex size-6 shrink-0 items-center justify-center rounded-full text-caption ${
                    step.done
                      ? "bg-navy text-white"
                      : "border border-navy/25 text-navy/60"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-heading text-navy italic">
                    {step.title}
                  </p>
                  <p className="mt-1 text-small text-navy/70">
                    {step.description}
                  </p>
                  {step.locked ? (
                    <p className="font-mono mt-2 text-eyebrow text-navy/50 uppercase">
                      Opens once you&rsquo;ve watched the welcome session
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          );

          // A locked or finished step isn't a link: nothing useful to follow,
          // and a link that goes nowhere is worse than plain text for anyone
          // tabbing through.
          if (step.locked) {
            return (
              <Card as="li" key={step.key} className="opacity-60">
                {inner}
              </Card>
            );
          }

          return (
            <Card as="li" key={step.key} padded={false}>
              <Link
                href={step.href}
                className="block p-5 transition hover:bg-white/40 sm:p-6"
              >
                {inner}
                <span className="mt-3 inline-block text-small text-navy underline decoration-orange decoration-2 underline-offset-4">
                  {step.done ? "Review" : "Start"}
                </span>
              </Link>
            </Card>
          );
        })}
      </ol>

      {member.onboarding_start_date ? (
        <Itinerary onboardingStartDate={member.onboarding_start_date} />
      ) : (
        <Card>
          <Eyebrow>Your itinerary</Eyebrow>
          <p className="mt-2 text-small text-navy/70">
            Your dates will appear here once your start date is set. Ask Nina if
            it doesn&rsquo;t show up.
          </p>
        </Card>
      )}
    </main>
  );
}
