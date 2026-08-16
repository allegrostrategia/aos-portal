import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { formatSessionTime } from "@/lib/time-zone";
import { hotSeatCopy, renderEmail, weeklyLogCopy, type EmailCopy } from "@/lib/jobs/copy";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reminder copy — aOS admin" };

/**
 * Every reminder, rendered, sending nothing.
 *
 * Reading a change of wording used to mean deleting a queue row, re-running the
 * cron and waiting on an inbox — three steps that test delivery, which works,
 * rather than the words, which were the thing in question. This tests the words.
 *
 * The variants that branch are shown in both states, since the interesting
 * mistakes live in the branch nobody thought to look at.
 */
export default async function ReminderPreviewPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("hot_seat_sessions")
    .select("scheduled_for, zoom_url")
    .not("scheduled_for", "is", null)
    .order("session_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  const session = sessionRow as
    | { scheduled_for: string; zoom_url: string | null }
    | null;

  const base = env.siteUrl ?? "https://aos.allegrostrategia.com";
  const when = session
    ? formatSessionTime(session.scheduled_for)
    : "Sunday 6 September at 14:00";
  const firstName = "Dominic";

  const samples: { label: string; note?: string; copy: EmailCopy }[] = [
    {
      label: "Weekly log · Wednesday",
      note: "Only if under 4 hours logged. Shown at 2h 30m.",
      copy: weeklyLogCopy("log_reminder_midweek", {
        firstName,
        loggedMinutes: 150,
        shortBy: 450,
        logUrl: `${base}/log`,
      }),
    },
    {
      label: "Weekly log · Friday",
      note: "Only if the week still won't count. Shown 2h short.",
      copy: weeklyLogCopy("log_reminder_endweek", {
        firstName,
        loggedMinutes: 480,
        shortBy: 120,
        logUrl: `${base}/log`,
      }),
    },
    {
      label: "Hot seat · 7 days out",
      note: "Everyone active.",
      copy: hotSeatCopy("hot_seat_submit_7d", {
        firstName,
        when,
        zoomUrl: session?.zoom_url ?? null,
        baseUrl: base,
        hasSubmitted: false,
      }),
    },
    {
      label: "Hot seat · 2 days out",
      note: "Non-submitters only.",
      copy: hotSeatCopy("hot_seat_submit_2d", {
        firstName,
        when,
        zoomUrl: session?.zoom_url ?? null,
        baseUrl: base,
        hasSubmitted: false,
      }),
    },
    {
      label: "Hot seat · day before — not submitted",
      note: "Goes to everyone active, so this branch exists.",
      copy: hotSeatCopy("hot_seat_attend_1d", {
        firstName,
        when,
        zoomUrl: session?.zoom_url ?? null,
        baseUrl: base,
        hasSubmitted: false,
      }),
    },
    {
      label: "Hot seat · day before — submitted",
      copy: hotSeatCopy("hot_seat_attend_1d", {
        firstName,
        when,
        zoomUrl: session?.zoom_url ?? null,
        baseUrl: base,
        hasSubmitted: true,
      }),
    },
    {
      label: "Hot seat · morning of — not submitted",
      note: "The final nudge. The two day-of emails are mutually exclusive.",
      copy: hotSeatCopy("hot_seat_submit_final", {
        firstName,
        when,
        zoomUrl: session?.zoom_url ?? null,
        baseUrl: base,
        hasSubmitted: false,
      }),
    },
    {
      label: "Hot seat · morning of — submitted",
      copy: hotSeatCopy("hot_seat_attend_am", {
        firstName,
        when,
        zoomUrl: session?.zoom_url ?? null,
        baseUrl: base,
        hasSubmitted: true,
      }),
    },
  ];

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Reminder copy"
        title="Every email, as members read it"
        intro="Nothing is sent from this page. Times and links come from the next scheduled session, so what's below is what would actually go out."
      />

      {!session ? (
        <Card className="mb-5">
          <p className="text-small text-navy/70">
            No session with a time set, so the hot seat examples use a placeholder
            date.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-5">
        {samples.map((sample) => (
          <Card key={sample.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow tone="accent">{sample.label}</Eyebrow>
              {sample.note ? (
                <p className="text-caption text-navy/50">{sample.note}</p>
              ) : null}
            </div>

            <p className="mt-3 text-small font-medium text-navy">
              Subject: {sample.copy.subject}
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-navy/10 bg-white/70 p-4 text-small whitespace-pre-wrap text-navy/80">
              {renderEmail(sample.copy)}
            </pre>
          </Card>
        ))}
      </div>
    </main>
  );
}
