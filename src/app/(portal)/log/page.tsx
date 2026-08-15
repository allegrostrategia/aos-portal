import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/member";
import { deleteEntry, updateEntryNote } from "@/lib/timer/actions";
import {
  COMPLETE_WEEK_MINUTES,
  getRunningEntry,
  getThisWeekTotal,
  getTimeCategories,
  getTodayEntries,
} from "@/lib/timer/queries";
import { formatMinutes, weekProgress } from "@/lib/timer/format";
import {
  currentWeekStart,
  getRoadmapItems,
  getWeekCategoryTotals,
  getWeeklySubmission,
} from "@/lib/log/queries";
import { primingForWeek } from "@/lib/log/priming";
import { addDays } from "@/lib/onboarding/cadence";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { ManualEntryForm } from "./manual-entry-form";
import { WeeklyLogForm } from "./weekly-log-form";

export const metadata: Metadata = {
  title: "This week’s log — aOS",
};

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

/**
 * The weekly check-in (§4) — one submission doing three jobs.
 *
 * Framed as a dated log entry, a ship's log, rather than a generic form: this is
 * the week as it happened, signed off and left alone, not a document that keeps
 * being revised.
 *
 * During onboarding weeks 2–3 it's time tracking only, because there's no
 * roadmap for actions-taken to reference — that falls out naturally rather than
 * needing a special case, since the checklist is empty until a roadmap exists.
 */
export default async function WeeklyLogPage() {
  const member = await requireMember();

  const weekStart = currentWeekStart();
  const today = new Date().toISOString().slice(0, 10);

  const [
    categories,
    entries,
    week,
    running,
    categoryTotals,
    roadmapItems,
    submission,
  ] = await Promise.all([
    getTimeCategories(),
    getTodayEntries(member.id),
    getThisWeekTotal(member.id),
    getRunningEntry(member.id),
    getWeekCategoryTotals(member.id, weekStart),
    getRoadmapItems(member.id),
    getWeeklySubmission(member.id, weekStart),
  ]);

  const priming = primingForWeek(member.onboarding_start_date, today);
  const labelFor = (slug: string) =>
    categories.find((c) => c.slug === slug)?.label ?? slug;

  const remaining = Math.max(0, COMPLETE_WEEK_MINUTES - week.loggedMinutes);
  const progress = weekProgress(week.loggedMinutes, COMPLETE_WEEK_MINUTES);
  const submitted = Boolean(submission?.submitted_at);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow={`Week of ${DAY.format(new Date(weekStart))}`}
        title="This week’s log"
        intro={`${DAY.format(new Date(weekStart))} – ${DAY.format(
          new Date(addDays(weekStart, 6)),
        )}. Logged as you go, signed off at the end.`}
      />

      {priming ? (
        <Card className="mb-5 border-navy/15 bg-lemon/25">
          <Eyebrow tone="accent">While you&rsquo;re here</Eyebrow>
          <h2 className="font-display mt-2 text-heading text-navy italic">
            {priming.title}
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-small text-navy/80">
            {priming.body.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <Eyebrow>Tracked this week</Eyebrow>
          <p className="font-mono mt-2 text-title text-navy tabular-nums">
            {formatMinutes(week.loggedMinutes)}
          </p>

          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-navy/10"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress toward a complete week"
          >
            <div
              className={`h-full rounded-full transition-all ${
                week.isCompleteWeek ? "bg-navy" : "bg-orange"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-2 text-small text-navy/70">
            {week.isCompleteWeek
              ? "Ten hours logged — this week counts, and you’re in the draw."
              : `${formatMinutes(remaining)} more makes it a complete week.`}
          </p>
        </Card>

        <Card>
          <Eyebrow>Where it went</Eyebrow>
          {categoryTotals.length === 0 ? (
            <p className="mt-3 text-small text-navy/70">
              Nothing logged yet. Start the timer when you begin something.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {categoryTotals.map((row) => (
                <li
                  key={row.slug}
                  className="flex items-baseline justify-between gap-3 text-small"
                >
                  <span className="min-w-0 truncate text-navy/80">
                    {row.label}
                  </span>
                  <span className="font-mono text-navy tabular-nums">
                    {formatMinutes(row.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
        Today
      </h2>

      {entries.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            Nothing yet today. Use the timer in the corner when you start
            something.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-navy/10 bg-white/60 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="text-body text-navy">
                    {labelFor(entry.category_slug)}
                    {entry.source === "manual" ? (
                      <span className="font-mono ml-2 text-eyebrow text-navy/40 uppercase">
                        added later
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-caption text-navy/50">
                    {TIME.format(new Date(entry.started_at))}
                    {entry.ended_at
                      ? `–${TIME.format(new Date(entry.ended_at))}`
                      : " · running"}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-mono text-small text-navy tabular-nums">
                    {entry.ended_at
                      ? formatMinutes(entry.duration_minutes ?? 0)
                      : "—"}
                  </span>
                  <form action={deleteEntry}>
                    <input type="hidden" name="id" value={entry.id} />
                    <button
                      type="submit"
                      className="text-caption text-navy/40 underline underline-offset-4 transition hover:text-navy"
                      aria-label={`Delete ${labelFor(entry.category_slug)} entry`}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>

              {/* A plain <details> rather than a client component: no JavaScript
                  to load, works before hydration, and keeps the note as
                  genuinely optional furniture rather than something the row is
                  built around. */}
              <details className="group mt-1">
                <summary className="cursor-pointer list-none text-caption text-navy/50 transition hover:text-navy">
                  {entry.note ? (
                    <span className="text-navy/70 italic">{entry.note}</span>
                  ) : (
                    <span className="underline underline-offset-4">
                      Add a note
                    </span>
                  )}
                </summary>

                <form
                  action={updateEntryNote}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="id" value={entry.id} />
                  <label htmlFor={`note-${entry.id}`} className="sr-only">
                    Note for this entry
                  </label>
                  <input
                    id={`note-${entry.id}`}
                    name="note"
                    type="text"
                    defaultValue={entry.note ?? ""}
                    placeholder="What specifically were you doing?"
                    className="min-w-0 flex-1 rounded-md border border-navy/15 bg-white px-3 py-1.5 text-small text-navy placeholder:text-navy/40"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-navy/20 px-3 py-1.5 text-small text-navy transition hover:border-navy/40"
                  >
                    Save
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <ManualEntryForm categories={categories} today={today} />
      </div>

      <h2 className="font-display mt-10 mb-3 text-heading text-navy italic">
        Sign off the week
      </h2>

      {submitted ? (
        <Card>
          <Eyebrow>Signed</Eyebrow>
          <p className="mt-2 text-small text-navy/80">
            This week&rsquo;s log is in. Your time keeps tracking — the entry
            itself stays as written.
          </p>
          {submission?.other_activity ? (
            <p className="mt-3 border-l-2 border-orange/40 pl-3 text-small text-navy/70 italic">
              {submission.other_activity}
            </p>
          ) : null}
        </Card>
      ) : (
        <WeeklyLogForm
          roadmapItems={roadmapItems}
          defaultOtherActivity={submission?.other_activity ?? ""}
        />
      )}

      {running ? (
        <p className="mt-6 text-small text-navy/60">
          A timer is still running — it&rsquo;ll count once you stop it.
        </p>
      ) : null}
    </main>
  );
}
