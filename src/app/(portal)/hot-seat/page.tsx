import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/member";
import { getMySubmission, getUpcomingSession } from "@/lib/hot-seat/queries";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { formatSessionTime } from "@/lib/time-zone";
import { SubmissionForm } from "./submission-form";

export const metadata: Metadata = {
  title: "Hot seat — aOS",
};

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/**
 * The hot seat (§5).
 *
 * One fixed monthly group slot — not bookable, not personalised. Whoever shows
 * up gets worked on live, five minutes guaranteed each, and a quieter month
 * means more time apiece rather than a shorter session.
 */
export default async function HotSeatPage() {
  const member = await requireMember();
  const session = await getUpcomingSession();
  const submission = session
    ? await getMySubmission(member.id, session.id)
    : null;

  const isActive = member.status === "active";

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Hot seat"
        title={
          session
            ? `${MONTH.format(new Date(session.session_month))}`
            : "The hot seat"
        }
        intro="One session a month, everyone together. Whoever turns up gets worked on live — five minutes each at minimum, and more when it's quieter."
      />

      {!session ? (
        <Card>
          <p className="text-small text-navy/70">
            The next session hasn&rsquo;t been scheduled yet. It&rsquo;s always
            week one of the month — Nina will confirm the time.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <Eyebrow>When</Eyebrow>
            <p className="font-display mt-2 text-heading text-navy italic">
              {session.scheduled_for
                ? formatSessionTime(session.scheduled_for)
                : "Week one — time to be confirmed"}
            </p>
            {session.zoom_url ? (
              <p className="mt-3">
                <a
                  href={session.zoom_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-small text-navy underline decoration-orange decoration-2 underline-offset-4"
                >
                  Join on Zoom
                </a>
              </p>
            ) : (
              <p className="mt-2 text-small text-navy/60">
                The link appears here once Nina sets it.
              </p>
            )}
          </Card>

          {/* §5's expectation-setting, said plainly rather than left to be
              discovered in the room. At a few minutes a head, "live build" means
              confirming a prepared direction and adding judgement — not starting
              from a blank page. Better to be explicit than to have the promise
              quietly outrun what happens. */}
          <Card className="mb-5 bg-lemon/25">
            <Eyebrow tone="accent">What actually happens</Eyebrow>
            <p className="mt-2 text-small text-navy/80">
              Nina arrives having already read your tracked time and your
              submission, with a specific direction drafted. The live part is
              confirming that direction and building against it with her
              judgement in the room — not starting from nothing. That&rsquo;s why
              the submission matters more than it looks.
            </p>
          </Card>

          {isActive ? (
            <>
              <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
                {submission?.submitted_at ? "Your submission" : "Submit yours"}
              </h2>
              <SubmissionForm sessionId={session.id} submission={submission} />
            </>
          ) : (
            <Card>
              <Eyebrow>Not yet</Eyebrow>
              <p className="mt-2 text-small text-navy/80">
                The hot seat opens once you&rsquo;re active. It&rsquo;s built
                around a live challenge that comes out of your first roadmap, so
                there&rsquo;s nothing to work on until that conversation has
                happened. You&rsquo;re welcome to see what&rsquo;s coming in the
                meantime.
              </p>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
