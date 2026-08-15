import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  getMonthTimeByMember,
  getSessionSubmissions,
} from "@/lib/admin/hot-seat-prep";
import { formatMinutes } from "@/lib/timer/format";
import { Badge, Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Prep — aOS admin" };

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/**
 * Nina's prep sheet (§5): every submission for a session, each alongside where
 * that member's hours actually went, and a box to lock the challenge.
 *
 * Claude's drafted suggestion appears here once the API key is configured. Until
 * then the box starts from the member's own words, which is the honest fallback
 * — and the same place the draft will start from anyway.
 */
export default async function SessionPrepPage({
  params,
}: PageProps<"/admin/hot-seat/[sessionId]">) {
  await requireAdmin();
  const { sessionId } = await params;

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("hot_seat_sessions")
    .select("id, session_month, scheduled_for")
    .eq("id", sessionId)
    .maybeSingle();

  const session = sessionRow as
    | { id: string; session_month: string; scheduled_for: string | null }
    | null;
  if (!session) notFound();

  const submissions = await getSessionSubmissions(session.id);
  const times = await getMonthTimeByMember(
    submissions.map((s) => s.member_id),
    session.session_month,
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
        intro={`${submissions.length} submission${submissions.length === 1 ? "" : "s"}. Lock each challenge before the call — the live time goes on building it, not writing it up.`}
      />

      {submissions.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            Nothing submitted yet. If nobody does, §5&rsquo;s fallback is to work
            from whatever their tracked data shows as the biggest time block.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {submissions.map((submission) => {
            const time = times.get(submission.member_id);
            const name = submission.members?.full_name ?? "Member";

            return (
              <Card key={submission.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="font-display text-heading text-navy italic">
                      {name}
                    </p>
                    <p className="text-caption text-navy/50">
                      {submission.members?.email}
                    </p>
                  </div>
                  {submission.confirmed_at ? (
                    <Badge tone="sky">Prepped</Badge>
                  ) : (
                    <Badge tone="gold">To prep</Badge>
                  )}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <div>
                      <Eyebrow>In their words</Eyebrow>
                      <p className="mt-1 text-small text-navy/80">
                        {submission.challenge || "—"}
                      </p>
                    </div>
                    {submission.already_tried ? (
                      <div>
                        <Eyebrow>Already tried</Eyebrow>
                        <p className="mt-1 text-small text-navy/80">
                          {submission.already_tried}
                        </p>
                      </div>
                    ) : null}
                    {submission.done_looks_like ? (
                      <div>
                        <Eyebrow>Done would look like</Eyebrow>
                        <p className="mt-1 text-small text-navy/80">
                          {submission.done_looks_like}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <Eyebrow>Where their month actually went</Eyebrow>
                    {time && time.byCategory.length > 0 ? (
                      <>
                        <p className="font-mono mt-1 text-small text-navy tabular-nums">
                          {formatMinutes(time.totalMinutes)} logged
                        </p>
                        <ul className="mt-2 flex flex-col gap-1">
                          {time.byCategory.slice(0, 5).map((row) => (
                            <li
                              key={row.label}
                              className="flex items-baseline justify-between gap-3 text-small"
                            >
                              <span className="min-w-0 truncate text-navy/70">
                                {row.label}
                              </span>
                              <span className="font-mono text-navy tabular-nums">
                                {formatMinutes(row.minutes)}
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

                {submission.suggested_challenge ? (
                  <div className="mt-4 rounded-md border border-sky/40 bg-sky/10 p-3">
                    <Eyebrow>Drafted suggestion</Eyebrow>
                    <p className="mt-1 text-small text-navy/80">
                      {submission.suggested_challenge}
                    </p>
                  </div>
                ) : null}

                <ConfirmForm
                  submissionId={submission.id}
                  memberName={name.split(" ")[0]}
                  suggested={submission.suggested_challenge ?? ""}
                  initial={
                    submission.confirmed_challenge ??
                    submission.suggested_challenge ??
                    submission.challenge ??
                    ""
                  }
                  isConfirmed={Boolean(submission.confirmed_at)}
                />
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
