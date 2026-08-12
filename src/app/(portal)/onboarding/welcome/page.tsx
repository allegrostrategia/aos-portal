import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { markWelcomeWatched } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Welcome session — aOS",
};

/**
 * Step zero (§1). Recorded once, watched by every cohort, so it never becomes a
 * standing monthly commitment for Nina.
 *
 * The video itself isn't uploaded yet, so the player is a placeholder. The gate
 * around it is real, which is the part everything else depends on.
 */
export default async function WelcomeSessionPage() {
  const member = await requireMember();
  const watched = Boolean(member.welcome_session_watched_at);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <Eyebrow tone="accent">Step zero</Eyebrow>
      <h1 className="font-display mt-2 text-display text-navy italic">
        Welcome to aOS
      </h1>
      <p className="mt-3 text-body text-navy/70">
        Before the audit, before anything else. This one sets out what kind of
        space this is — the audit teaches you how it works.
      </p>

      <div className="mt-6 flex aspect-video items-center justify-center rounded-xl border border-navy/15 bg-navy/5">
        <p className="px-6 text-center text-small text-navy/50">
          {/* TODO(step-3): swap for the real recording once Nina has it. */}
          Nina&rsquo;s recording lands here.
        </p>
      </div>

      <Card className="mt-6">
        <Eyebrow>What it covers</Eyebrow>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-small text-navy/80">
          <li>
            The promise: every month, one real thing that&rsquo;s costing you
            time or money gets built, live, from your own data.
          </li>
          <li>Why you&rsquo;re here, and what&rsquo;s expected of you.</li>
          <li>
            What this isn&rsquo;t — not advice on demand, not unlimited access
            outside the structure, and not somewhere momentum happens to you.
          </li>
          <li>The method underneath the whole approach.</li>
        </ul>
      </Card>

      <div className="mt-8">
        {watched ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-small text-navy/70">
              You&rsquo;ve watched this — your audit is open.
            </p>
            <Link
              href="/onboarding/audit"
              className="text-small text-navy underline decoration-orange decoration-2 underline-offset-4"
            >
              Go to your audit
            </Link>
          </div>
        ) : (
          <form action={markWelcomeWatched}>
            <Button type="submit">I&rsquo;ve watched this</Button>
            <p className="mt-3 text-small text-navy/60">
              This just unlocks the next step — nobody&rsquo;s checking.
            </p>
          </form>
        )}
      </div>

      <p className="mt-8">
        <Link
          href="/onboarding"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Back to your first weeks
        </Link>
      </p>
    </main>
  );
}
