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
 * Sequence, reordered in round 4 (item 6):
 *   1. Watch the onboarding video          (content: on Nina's list)
 *   2. Fill in the onboarding form         } these two run in parallel:
 *   3. Two weeks of time tracking          } neither waits for the other
 *   4. Book the 1:1 call: unlocked by the FORM, not by tracking, which can
 *      still be running in the background
 *   5. Roadmap arrives                     (passive: derived, never ticked)
 *   6. Submit first hot seat: LOCKED until the roadmap has arrived
 *
 * A locked step is shown, with why, and has no link. `next` is the first
 * step that is neither done nor locked, so the section always points at
 * something the member can actually do.
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
  /** Can't be done yet, and this is why. A locked step has no link. */
  locked?: string;
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

  const formDone = done("form", Boolean(audit));
  // Derived only: a confirmed roadmap row. Not tickable, so this step
  // changes on its own the moment Nina publishes one (round 4, item 6).
  const roadmapDone = Boolean(roadmap);

  const steps: OnboardingStep[] = [
    {
      key: "video",
      title: "Watch the onboarding video",
      description: "How everything here works, and what the programme actually promises. Worth watching before anything else.",
      href: "/onboarding/welcome",
      done: done("video", Boolean(member.welcome_session_watched_at)),
      tickable: true,
      pending: "Nina's recording it",
    },
    {
      key: "form",
      title: "Fill in the onboarding form",
      description: "A short set of questions across the eleven stations. It's what your roadmap gets built from. Do this alongside the tracking; neither waits for the other.",
      href: "/onboarding/audit",
      done: formDone,
      tickable: false,
    },
    {
      key: "tracking",
      title: "Two weeks of time tracking",
      description: "Log your time and sign off two weeks. The roadmap is built from what your week actually shows. This keeps running while you do the rest.",
      href: "/log",
      done: done("tracking", ((weeks ?? []) as unknown[]).length >= 2),
      tickable: false,
      pending: "Short explainer video on Nina's list",
    },
    {
      key: "call",
      title: "Book your 1:1 call",
      description: "Nina reads your form and whatever tracking you have so far, and the two of you work out the roadmap.",
      href: null,
      done: done("call", false),
      tickable: true,
      locked: formDone ? undefined : "Fill in the onboarding form first",
    },
    {
      key: "roadmap",
      title: "Your roadmap arrives",
      description: "The outcome of the call. Nothing for you to do here; this ticks itself when Nina publishes it.",
      href: null,
      done: roadmapDone,
      tickable: false,
    },
    {
      key: "hot_seat",
      title: "Submit your first hot seat",
      description: "One real thing, built live. Say what's making you feel stuck and what you'd like to hot seat.",
      href: "/hot-seat",
      done: done("hot_seat", Boolean(hotSeat)),
      tickable: false,
      locked: roadmapDone ? undefined : "Unlocks when your roadmap arrives",
    },
  ];

  const completeCount = steps.filter((s) => s.done).length;

  return {
    steps,
    completeCount,
    allDone: completeCount === steps.length,
    next: steps.find((s) => !s.done && !s.locked) ?? null,
  };
}
