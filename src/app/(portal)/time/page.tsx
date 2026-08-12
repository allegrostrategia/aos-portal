import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/member";
import { deleteEntry } from "@/lib/timer/actions";
import {
  COMPLETE_WEEK_MINUTES,
  getRunningEntry,
  getThisWeekTotal,
  getTimeCategories,
  getTodayEntries,
} from "@/lib/timer/queries";
import { formatMinutes, weekProgress } from "@/lib/timer/format";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { ManualEntryForm } from "./manual-entry-form";

export const metadata: Metadata = {
  title: "Your log — aOS",
};

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const WEEK_OF = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});

export default async function TimeLogPage() {
  await requireMember();

  const [categories, entries, week, running] = await Promise.all([
    getTimeCategories(),
    getTodayEntries(),
    getThisWeekTotal(),
    getRunningEntry(),
  ]);

  const labelFor = (slug: string) =>
    categories.find((c) => c.slug === slug)?.label ?? slug;

  const todayMinutes = entries.reduce(
    (total, entry) => total + (entry.duration_minutes ?? 0),
    0,
  );

  const remaining = Math.max(0, COMPLETE_WEEK_MINUTES - week.loggedMinutes);
  const progress = weekProgress(week.loggedMinutes, COMPLETE_WEEK_MINUTES);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Your log"
        title="Where the time went"
        intro="Start the timer when you begin something and stop it when you're done. Logged as you go is worth more than remembered at the end of the week — that's the whole point of it."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <Eyebrow>This week</Eyebrow>
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
            {week.isCompleteWeek ? (
              <>
                Ten hours logged — this week counts, and you&rsquo;re in the
                draw.
              </>
            ) : (
              <>
                {formatMinutes(remaining)} more makes it a complete week. Week of{" "}
                {WEEK_OF.format(new Date(week.weekStartDate))}.
              </>
            )}
          </p>
        </Card>

        <Card>
          <Eyebrow>Today</Eyebrow>
          <p className="font-mono mt-2 text-title text-navy tabular-nums">
            {formatMinutes(todayMinutes)}
          </p>
          <p className="mt-2 text-small text-navy/70">
            {running
              ? "Still running — the total updates when you stop."
              : entries.length === 0
                ? "Nothing logged yet today."
                : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} so far.`}
          </p>
        </Card>
      </div>

      <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
        Today
      </h2>

      {entries.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            Nothing yet. Use the timer in the corner when you start something.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-navy/10 bg-white/60 px-4 py-3"
            >
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
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-small text-navy tabular-nums">
                  {entry.ended_at
                    ? formatMinutes(entry.duration_minutes ?? 0)
                    : "—"}
                </span>
                {/* Deleting a mistake isn't destroying a record of anything —
                    a timer left running overnight is common and correcting it
                    matters more than preserving it. */}
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
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <ManualEntryForm
          categories={categories}
          today={new Date().toISOString().slice(0, 10)}
        />
      </div>
    </main>
  );
}
