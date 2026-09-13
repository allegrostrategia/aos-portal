import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/supabase/types";

/**
 * Where a member is in onboarding — the six steps (L'Editoriale §7).
 *
 * **Independent of `members.status` by design.** The section on Piazza stays
 * until all six are genuinely complete, and some of them — the roadmap
 * arriving, the first hot seat — complete after status has flipped to active.
 * Nothing in here reads the status column, so nothing in here can be fooled by
 * it.
 *
 * Derived wherever there is a source of truth, stored only where there isn't.
 * Five of the six have a fact in the product already: a submitted audit, the
 * welcome timestamp, signed-off weeks, a confirmed roadmap, a hot-seat
 * submission. A column tracking "which step are they on" would be a copy of
 * those that can disagree with them. "I've booked my 1:1" has no fact behind
 * it — only the member knows — so that one is a tick in `onboarding_steps`.
 * Any step accepts a tick as well, for the case where it happened outside the
 * product (the welcome watched on a call with Nina); a tick never *un*-does a
 * derived fact.
 *
 * Sequence, confirmed in the brief:
 *   1. Fill in the onboarding form
 *   2. Watch the onboarding video          (content: on Nina's list)
 *   3. Two weeks of time tracking          (explainer video: on Nina's list)
 *   4. Book the 1:1 call — week 4
 *   5. Roadmap arrives                     (passive: the outcome of the call)
 *   6. Submit first hot seat
 */

export type OnboardingStepKey = "form" | "video" | "tracking" | "call" | "roadmap" | "hot_seat";

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  /** Where to go to do it, or null for a passive step. */
  href: string | null;
  done: boolean;
  /** True when the member can tick it themselves (no fact in the product). */
  tickable: boolean;
  /** Something is still waiting on Nina — content, not the member. */
  pending?: string;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  completeCount: number;
  allDone: boolean;
  /** The first step not yet done — where the section points. */
  next: OnboardingStep | null;
};

export async function getOnboardingProgress(member: Member): Promise<OnboardingProgress> {
  const supabase = await createClient();

  // RLS scopes every one of these to the member's own rows.
  const [
    { data: audit },
    { data: weeks },
    { data: roadmap },
    { data: hotSeat },
    { data: ticks },
  ] = await Promise.all([
    supabase
      .from("member_audits")
      .select("id")
      .eq("member_id", member.id)
      .eq("occasion", "onboarding")
      .not("submitted_at", "is", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_submissions")
      .select("week_start_date")
      .eq("member_id", member.id)
      .not("submitted_at", "is", null)
      .limit(2),
    supabase
      .from("roadmap")
      .select("id")
      .eq("member_id", member.id)
      .not("confirmed_at", "is", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("hot_seat_submissions")
      .select("id")
      .eq("member_id", member.id)
      .not("submitted_at", "is", null)
      .limit(1)
      .maybeSingle(),
    supabase.from("onboarding_steps").select("step").eq("member_id", member.id),
  ]);

  const ticked = new Set(((ticks ?? []) as { step: OnboardingStepKey }[]).map((t) => t.step));
  const done = (key: OnboardingStepKey, fact: boolean) => fact || ticked.has(key);

  const steps: OnboardingStep[] = [
    {
      key: "form",
      title: "Fill in the onboarding form",
      description: "A short set of questions across the eleven stations. It's what your roadmap gets built from.",
      href: "/onboarding/audit",
      done: done("form", Boolean(audit)),
      tickable: false,
    },
    {
      key: "video",
      title: "Watch the onboarding video",
      description: "What kind of space this is, and what the programme actually promises.",
      href: "/onboarding/welcome",
      done: done("video", Boolean(member.welcome_session_watched_at)),
      tickable: true,
      pending: "Nina's recording it",
    },
    {
      key: "tracking",
      title: "Two weeks of time tracking",
      description: "Log your time and sign off two weeks. The roadmap is built from what your week actually shows.",
      href: "/log",
      done: done("tracking", ((weeks ?? []) as unknown[]).length >= 2),
      tickable: false,
      pending: "Short explainer video on Nina's list",
    },
    {
      key: "call",
      title: "Book your 1:1 call",
      description: "Week four. Nina reads your audit and your two weeks, and the two of you work out the roadmap.",
      href: null,
      done: done("call", false),
      tickable: true,
    },
    {
      key: "roadmap",
      title: "Your roadmap arrives",
      description: "The outcome of the call — nothing for you to do here.",
      href: null,
      done: done("roadmap", Boolean(roadmap)),
      tickable: false,
    },
    {
      key: "hot_seat",
      title: "Submit your first hot seat",
      description: "One real thing, built live. Say what you're stuck on and what done looks like.",
      href: "/hot-seat",
      done: done("hot_seat", Boolean(hotSeat)),
      tickable: false,
    },
  ];

  const completeCount = steps.filter((s) => s.done).length;

  return {
    steps,
    completeCount,
    allDone: completeCount === steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}
