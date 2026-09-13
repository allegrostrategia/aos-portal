import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/member";
import { getOnboardingProgress } from "@/lib/onboarding/progress";
import { OnboardingPath } from "@/components/onboarding/onboarding-path";
import { PageHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Your first weeks — aOS",
};

/**
 * The six onboarding steps in full. The compact version sits at the top of
 * Piazza until all six are done; this is where "All steps" leads.
 */
export default async function OnboardingPage() {
  const member = await requireMember();
  const progress = await getOnboardingProgress(member);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <PageHeader
        title="Your first weeks"
        tagline="Grand Hotel Riposo"
        intro={
          progress.allDone
            ? "That's everything. Keep logging your time — your roadmap keeps being built from it."
            : "Six steps, in your own time. The rest of aOS opens up as you go."
        }
      />
      <OnboardingPath progress={progress} />
    </main>
  );
}
