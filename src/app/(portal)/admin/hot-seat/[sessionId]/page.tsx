import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { getMonthTimeByMember, getSessionPrep } from "@/lib/admin/hot-seat-prep";
import { formatMinutes } from "@/lib/timer/format";
import { Badge, Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { AttendanceForm, ConfirmForm, ReplayNoteForm } from "./prep-forms";

export const metadata: Metadata = { title: "Prep — aOS admin" };

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/**
 * Nina's prep sheet (§5).
 *
 * Every active member, not every submission. A member who never submits has no
 * submission row, and listing only submissions made §5's own fallback —
 * "defaults to whatever their tracked data shows as the biggest time-block" —
 * impossible to act on: the people who most need a challenge worked out for them
 * were the only ones missing from the screen.
 *
 * Their tracked time carries the weight where their words are absent, which is
 * why it sits beside every member rather than only the ones who wrote something.
 *
 * Claude's drafted suggestion appears here if one exists. AI drafting is on hold
 * pending Nina's decision, so nothing here generates text — the fallback names
 * the biggest time block as evidence and leaves the writing to her.
 */
export default async function SessionPrepPage({
  params,
}: PageProps<"/admin/hot-seat/[sessionId]">) {
  await requireAdmin();
  const { sessionId } = await params;

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("hot_seat_sessions")
    .select("id, session_month, scheduled_for, replay_note")
    .eq("id", sessionId)
    .maybeSingle();

  const session = sessionRow as
    | {
        id: string;
        session_month: string;
        scheduled_for: string | null;
        replay_note: string | null;
      }
    | null;
  if (!session) notFound();

  const rows = await getSessionPrep(session.id);
  const times = await getMonthTimeByMember(
    rows.map((r) => r.memberId),
    session.session_month,
  );

  const submitted = rows.filter((r) => r.submittedAt).length;
  const locked = rows.filter((r) => r.confirmedAt).length;

  // Attendance is only a question once the session has actually run.
  const hasHappened = Boolean(
    session.scheduled_for && new Date(session.scheduled_for) < new Date(),
  );

  return (
    <main className="flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/admin/hot-seat"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← All sessions
        </Link>
      </p>

      <PageHeader
        eyebrow="Prep"
        title={MONTH.format(new Date(session.session_month))}
        intro={`${rows.length} member${rows.length === 1 ? "" : "s"} · ${submitted} submitted · ${locked} locked. Lock each challenge before the call — the live time goes on building it, not writing it up.`}
      />

      {hasHappened ? (
        <Card className="mb-5">
          <ReplayNoteForm sessionId={session.id} note={session.replay_note} />
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            No active members yet, so nobody to prep.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {rows.map((row) => {
            const time = times.get(row.memberId);
            const biggest = time?.byCategory[0];
            const firstName = row.fullName.split(" ")[0];

            // §5's fallback, surfaced rather than written. Naming the block is
            // evidence Nina can act on; generating a sentence for her to accept
            // unread is the thing "AI drafts, human confirms" exists to prevent
            // — doubly so while AI drafting is on hold.
            const fallbackHint =
              !row.submittedAt && biggest
                ? `No submission. Their biggest block was ${biggest.label} at ${formatMinutes(biggest.minutes)} — §5 says that's where to start.`
                : !row.submittedAt
                  ? "No submission, and nothing logged either — worth a conversation before the session."
                  : undefined;

            return (
              <Card key={row.memberId}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="font-display text-heading text-navy italic">
                      {row.fullName}
                    </p>
                    <p className="text-caption text-navy/50">{row.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!row.stillActive ? <Badge>Cancelled since</Badge> : null}
                    {row.submittedAt ? null : <Badge>No submission</Badge>}
                    {row.confirmedAt ? (
                      <Badge tone="sky">Prepped</Badge>
                    ) : (
                      <Badge tone="gold">To prep</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    {row.submittedAt ? (
                      <>
                        <div>
                          <Eyebrow>In their words</Eyebrow>
                          <p className="mt-1 text-small text-navy/80">
                            {row.challenge || "—"}
                          </p>
                        </div>
                        {row.alreadyTried ? (
                          <div>
                            <Eyebrow>Already tried</Eyebrow>
                            <p className="mt-1 text-small text-navy/80">
                              {row.alreadyTried}
                            </p>
                          </div>
                        ) : null}
                        {row.doneLooksLike ? (
                          <div>
                            <Eyebrow>Done would look like</Eyebrow>
                            <p className="mt-1 text-small text-navy/80">
                              {row.doneLooksLike}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div>
                        <Eyebrow>In their words</Eyebrow>
                        <p className="mt-1 text-small text-navy/60">
                          Nothing submitted. The hours on the right are all
                          there is to go on.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Eyebrow>Where their month actually went</Eyebrow>
                    {time && time.byCategory.length > 0 ? (
                      <>
                        <p className="font-mono mt-1 text-small text-navy tabular-nums">
                          {formatMinutes(time.totalMinutes)} logged
                        </p>
                        <ul className="mt-2 flex flex-col gap-1">
                          {time.byCategory.slice(0, 5).map((category, index) => (
                            <li
                              key={category.label}
                              className="flex items-baseline justify-between gap-3 text-small"
                            >
                              <span
                                className={`min-w-0 truncate ${
                                  index === 0 && !row.submittedAt
                                    ? "font-medium text-navy"
                                    : "text-navy/70"
                                }`}
                              >
                                {category.label}
                              </span>
                              <span className="font-mono text-navy tabular-nums">
                                {formatMinutes(category.minutes)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="mt-1 text-small text-navy/60">
                        Nothing logged this month — worth asking why before
                        building anything.
                      </p>
                    )}
                  </div>
                </div>

                {row.suggestedChallenge ? (
                  <div className="mt-4 rounded-md border border-sky/40 bg-sky/10 p-3">
                    <Eyebrow>Drafted suggestion</Eyebrow>
                    <p className="mt-1 text-small text-navy/80">
                      {row.suggestedChallenge}
                    </p>
                  </div>
                ) : null}

                <ConfirmForm
                  submissionId={row.submissionId}
                  sessionId={session.id}
                  memberId={row.memberId}
                  memberName={firstName}
                  suggested={row.suggestedChallenge ?? ""}
                  initial={
                    row.confirmedChallenge ??
                    row.suggestedChallenge ??
                    row.challenge ??
                    ""
                  }
                  isConfirmed={Boolean(row.confirmedAt)}
                  fallbackHint={fallbackHint}
                />

                {hasHappened ? (
                  <AttendanceForm
                    submissionId={row.submissionId}
                    sessionId={session.id}
                    memberId={row.memberId}
                    attended={row.attended}
                  />
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
