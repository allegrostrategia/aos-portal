import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { markCommentsSeen } from "@/lib/hot-seat/actions";
import {
  getComments,
  getMyHotSeatHistory,
  getMySubmission,
  getUpcomingSession,
  hasUnseenCoachComment,
  type HotSeatSubmission,
} from "@/lib/hot-seat/queries";
import { getMonthTimeByMember, type MemberMonthTime } from "@/lib/admin/hot-seat-prep";
import { formatMinutes } from "@/lib/timer/format";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { Thread } from "@/components/hot-seat/thread";
import { formatSessionTime } from "@/lib/time-zone";
import { SubmissionForm } from "./submission-form";
import { ReplyForm } from "./reply-form";

export const metadata: Metadata = {
  title: "Hot seat · aOS",
};

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/**
 * The hot seat (§5), with round 3's prep flow.
 *
 * One fixed monthly group slot, not bookable, not personalised. Whoever shows
 * up gets worked on live. The lead-up is the work: the submission, the
 * member's own reflection on their month, Nina's notes on it, and the
 * back-and-forth before the call. Once Nina confirms the build, that is what
 * the page shows, in its own box; the thread that got there folds away
 * behind a toggle.
 *
 * How long each person gets on the call is planning context for Nina and is
 * deliberately not written here (round 3 brief).
 */
export default async function HotSeatPage({ searchParams }: PageProps<"/hot-seat">) {
  const member = await requireMember();
  const params = await searchParams;
  const wanted = typeof params.month === "string" ? params.month : null;

  const [upcoming, history] = await Promise.all([getUpcomingSession(), getMyHotSeatHistory(member.id)]);

  // The month picker (round 4, item 10): the upcoming session, plus every
  // month they have a submission for. A past month is read-only: what they
  // wrote, what was said, what was built.
  const months = [
    ...(upcoming ? [{ session: upcoming, submission: null as HotSeatSubmission | null }] : []),
    ...history.filter((h) => h.session.id !== upcoming?.id),
  ];
  const chosen = wanted ? months.find((m) => m.session.session_month.startsWith(wanted)) : undefined;
  const session = chosen?.session ?? upcoming;
  const viewingPast = Boolean(session && upcoming && session.id !== upcoming.id) || Boolean(session && !upcoming);
  const submission = session ? await getMySubmission(member.id, session.id) : null;

  const [threads, times] = await Promise.all([
    submission ? getComments([submission.id]) : Promise.resolve(new Map<string, never[]>()),
    session && member.status === "active"
      ? getMonthTimeByMember([member.id], session.session_month)
      : Promise.resolve(new Map<string, MemberMonthTime>()),
  ]);
  const thread = submission ? (threads.get(submission.id) ?? []) : [];
  const month = times.get(member.id);

  // The member is looking at the thread, so the Piazza flag can clear. Done
  // here rather than from a client effect: the page in front of them is the
  // fact. Only when there is something new, so a plain visit writes nothing.
  if (submission && hasUnseenCoachComment(submission, thread)) {
    await markCommentsSeen(submission.id);
  }

  const isActive = member.status === "active";
  const confirmed = Boolean(submission?.confirmed_at && submission.confirmed_challenge);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Hot seat"
        title={session ? `${MONTH.format(new Date(session.session_month))}` : "The hot seat"}
        intro="One session a month, everyone together. Whoever turns up gets worked on live, and the more you put in beforehand, the more gets built."
      />

      {months.length > 1 ? (
        <nav aria-label="Month" className="-mt-4 mb-6 flex flex-wrap gap-2">
          {months.map((m) => {
            const key = m.session.session_month.slice(0, 7);
            const active = m.session.id === session?.id;
            return (
              <Link
                key={m.session.id}
                href={active ? "/hot-seat" : `/hot-seat?month=${key}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-small font-medium transition ${
                  active ? "bg-ink text-cream" : "bg-cream-deep text-ink/75 hover:text-ink"
                }`}
              >
                {MONTH.format(new Date(m.session.session_month))}
                {m.session.id === upcoming?.id ? " · next" : ""}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!session ? (
        <Card>
          <p className="text-small text-ink/70">
            The next session hasn&rsquo;t been scheduled yet. It&rsquo;s always
            week one of the month. Nina will confirm the time.
          </p>
        </Card>
      ) : viewingPast ? (
        <>
          {/* A past month, read-only (round 4, item 10). */}
          {confirmed && submission ? (
            <Card tone="dark" className="mb-5">
              <Eyebrow tone="light">What was built</Eyebrow>
              <p className="font-display mt-2 text-title font-medium">{submission.confirmed_challenge}</p>
              <p className="mt-3 text-small text-white/70">
                {session.scheduled_for ? `Session: ${formatSessionTime(session.scheduled_for)}.` : ""}
              </p>
            </Card>
          ) : null}
          {submission ? (
            <Card className="mb-5">
              <Eyebrow>What you wrote</Eyebrow>
              <dl className="mt-3 flex flex-col gap-3">
                {[
                  ["What was making you feel stuck", submission.challenge],
                  ["What was taking your time", submission.time_sink],
                  ["What you shouldn't have been doing", submission.should_stop],
                  ["What you wanted to hot seat", submission.reflection_unsure && !submission.reflection ? "Not sure yet" : submission.reflection],
                  ["What you'd already tried", submission.already_tried],
                  ["What done looked like", submission.done_looks_like],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-caption font-medium text-ink/55">{k}</dt>
                      <dd className="mt-0.5 text-small whitespace-pre-wrap text-ink/85">{v}</dd>
                    </div>
                  ))}
              </dl>
              {!submission.submitted_at ? (
                <p className="mt-3 text-small text-ink/60">You didn&rsquo;t submit for this one.</p>
              ) : null}
            </Card>
          ) : null}
          <Thread comments={thread} labelFor={(c) => (c.fromCoach ? "Nina" : "You")} archived />
        </>
      ) : (
        <>
          <Card className="mb-5">
            <Eyebrow>When</Eyebrow>
            <p className="font-display mt-2 text-heading font-medium text-ink">
              {session.scheduled_for
                ? formatSessionTime(session.scheduled_for)
                : "Week one. Time to be confirmed"}
            </p>
            {session.zoom_url ? (
              <p className="mt-3">
                <a
                  href={session.zoom_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-small text-ink underline decoration-orange decoration-2 underline-offset-4"
                >
                  Join on Zoom
                </a>
              </p>
            ) : (
              <p className="mt-2 text-small text-ink/60">
                The link appears here once Nina sets it.
              </p>
            )}
          </Card>

          {/* The confirmed build, once there is one: its own box, its own
              colour, above everything else (round 3, §B). Unmistakably "this
              is what we're doing", not another comment. */}
          {confirmed && submission ? (
            <Card tone="dark" className="mb-5">
              <Eyebrow tone="light">Confirmed. This is what gets built</Eyebrow>
              <p className="font-display mt-2 text-title font-medium">
                {submission.confirmed_challenge}
              </p>
              <p className="mt-3 text-small text-white/70">
                Locked by Nina
                {submission.confirmed_at ? ` on ${formatSessionTime(submission.confirmed_at)}` : ""}.
                Anything that has changed since, say on the call.
              </p>
            </Card>
          ) : null}

          {/* §5's expectation-setting, said plainly rather than left to be
              discovered in the room: "live build" means confirming a prepared
              direction and adding judgement, not starting from a blank page. */}
          <Card className="mb-5 bg-lemon/25">
            <Eyebrow tone="accent">What actually happens</Eyebrow>
            <p className="mt-2 text-small text-ink/80">
              Nina arrives having already read your tracked time, your
              submission and anything the two of you said about it, with a
              specific plan of action that Nina will work on ahead of your
              hot seat. The live part is confirming that plan and building
              against it with her judgement in the room, not starting from
              nothing. That&rsquo;s why the submission matters more than it
              looks.
            </p>
          </Card>

          {isActive ? (
            <>
              {/* Their month, so the reflection has something to reflect on. */}
              <Card className="mb-5">
                <Eyebrow>Your month so far</Eyebrow>
                {month && month.byCategory.length > 0 ? (
                  <>
                    <p className="font-mono mt-2 text-small text-ink tabular-nums">
                      {formatMinutes(month.totalMinutes)} logged
                    </p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {month.byCategory.slice(0, 5).map((category, index) => (
                        <li key={category.label} className="flex items-baseline justify-between gap-3 text-small">
                          <span className={index === 0 ? "font-medium text-ink" : "text-ink/70"}>
                            {category.label}
                          </span>
                          <span className="font-mono text-ink tabular-nums">
                            {formatMinutes(category.minutes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-2 text-small text-ink/60">
                    Nothing logged this month yet. The reflection below is easier with a log to look at.
                  </p>
                )}
                <p className="mt-3">
                  <Link href="/log" className="text-small text-ink underline decoration-orange decoration-2 underline-offset-4">
                    Open your log
                  </Link>
                </p>
              </Card>

              <h2 className="font-display mt-8 mb-3 text-heading font-medium text-ink">
                {submission?.submitted_at ? "Your submission" : "Submit yours"}
              </h2>
              <SubmissionForm sessionId={session.id} submission={submission} />

              {/* The thread (round 3, §B). Live while the build is unconfirmed;
                  archived behind a toggle once it is. */}
              {submission ? (
                <section className="mt-8">
                  {!confirmed ? (
                    <h2 className="font-display mb-3 text-heading font-medium text-ink">
                      Before the call
                    </h2>
                  ) : null}
                  {confirmed ? (
                    <Thread comments={thread} labelFor={(c) => (c.fromCoach ? "Nina" : "You")} archived />
                  ) : (
                    <Card>
                      <Thread comments={thread} labelFor={(c) => (c.fromCoach ? "Nina" : "You")}>
                        <ReplyForm submissionId={submission.id} />
                      </Thread>
                    </Card>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <Card>
              <Eyebrow>Not yet</Eyebrow>
              <p className="mt-2 text-small text-ink/80">
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
