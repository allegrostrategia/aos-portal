import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/supabase/types";

/**
 * Where a member is in onboarding.
 *
 * Derived every time rather than stored: each step already has a source of truth
 * — a timestamp on `members`, a submitted audit, a completed profile — and a
 * fourth column tracking "which step are they on" would only be a copy that can
 * disagree with them.
 */

export type OnboardingStepKey = "welcome" | "audit" | "directory";

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Gated by an earlier step rather than by membership status. */
  locked: boolean;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  completeCount: number;
  allDone: boolean;
};

export async function getOnboardingProgress(
  member: Member,
): Promise<OnboardingProgress> {
  const supabase = await createClient();

  // RLS scopes both of these to the member's own rows.
  const [{ data: audit }, { data: profile }] = await Promise.all([
    supabase
      .from("member_audits")
      .select("id")
      .eq("occasion", "onboarding")
      .not("submitted_at", "is", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("member_profiles")
      .select("completed_at")
      .eq("member_id", member.id)
      .maybeSingle(),
  ]);

  const welcomeDone = Boolean(member.welcome_session_watched_at);
  const auditDone = Boolean(audit);
  const directoryDone = Boolean(profile?.completed_at);

  const steps: OnboardingStep[] = [
    {
      key: "welcome",
      title: "Watch the welcome session",
      description:
        "What kind of space this is, and what the programme actually promises. Fifteen minutes, once.",
      href: "/onboarding/welcome",
      done: welcomeDone,
      locked: false,
    },
    {
      key: "audit",
      // §1: the audit unlocks once the welcome session has been watched.
      // Light-touch, no quiz — just sequence.
      title: "Complete your audit",
      description:
        "A short set of questions across the eleven stations. It's what your roadmap gets built from.",
      href: "/onboarding/audit",
      done: auditDone,
      locked: !welcomeDone,
    },
    {
      key: "directory",
      title: "Add your directory listing",
      description:
        "How you'd like the rest of the membership to find you, and the ways to work with you.",
      href: "/onboarding/directory",
      done: directoryDone,
      locked: false,
    },
  ];

  const completeCount = steps.filter((s) => s.done).length;

  return { steps, completeCount, allDone: completeCount === steps.length };
}
