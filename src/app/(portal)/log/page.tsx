import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { deleteEntry, updateEntryNote } from "@/lib/timer/actions";
import {
  COMPLETE_WEEK_MINUTES,
  getRunningEntry,
  getTimeCategories,
  getWeekEntries,
  getWeekTotal,
} from "@/lib/timer/queries";
import { formatMinutes, weekProgress } from "@/lib/timer/format";
import {
  getRoadmapItems,
  getWeekCategoryTotals,
  getWeeklySubmission,
} from "@/lib/log/queries";
import { primingForWeek } from "@/lib/log/priming";
import { dayWithin, resolveWeek, type WeekView } from "@/lib/log/weeks";
import { utcToWallClock } from "@/lib/time-zone";
import { Card, Chevron, Eyebrow, PageHeader, SectionTitle } from "@/components/ui/card";
import { FattoStamp } from "@/components/flourish/fatto-stamp";
import { ManualEntryForm } from "./manual-entry-form";
import { WeeklyLogForm } from "./weekly-log-form";
import { TimerPanel } from "./timer-panel";
import { WeekCalendar, dayOf } from "./log-calendar";
import { HoursByCategory, HoursByDay } from "./log-charts";
import { getMyAvailability, pairingMonth } from "@/lib/pairing/queries";

export const metadata: Metadata = {
  title: "Your log · aOS",
};

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const RANGE_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const RANGE_FULL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

type Tab = "log" | "timer" | "insights";

/**
 * Your log — the plan and the week's time in one place (L'Editoriale "07").
 *
 * §4's weekly check-in, restructured around the reference: a date range and a
 * day selector at the top, then three tabs. **Log** is the selected day as a
 * timeline of colour-coded blocks, its entries, and the weekly sign-off.
 * **Timer** is the same timer as the floating one, given the page. **Insights**
 * is the week as charts. Tabs and the day are query parameters, so each view
 * is a URL and the page needs no client state to switch.
 *
 * The roadmap side is deliberately thin: the brief parks the full Roadmap
 * screen for its own session. What is here is its entry point — the actions
 * checklist inside the sign-off, which is where a member ticks what they did
 * against the plan. The Piazza card is the other route in.
 *
 * Framed as a dated log entry, a ship's log, rather than a generic form: this is
 * the week as it happened, signed off and left alone, not a document that keeps
 * being revised. During onboarding weeks 2–3 it's time tracking only, because
 * there's no roadmap for actions-taken to reference — that falls out naturally
 * rather than needing a special case, since the checklist is empty until a
 * roadmap exists.
 */
export default async function WeeklyLogPage({ searchParams }: PageProps<"/log">) {
  const member = await requireMember();
  const params = await searchParams;

  const today = utcToWallClock(new Date()).slice(0, 10);

  // Which week is being read (Dom, 30 Sep). The current one is the only one
  // still being written: a past week is a record, so everything that changes
  // something is gone from it rather than disabled — a form that refuses is
  // worse than a form that isn't there.
  const view = resolveWeek(
    typeof params.week === "string" ? params.week : undefined,
    today,
    member.join_date,
  );
  const { weekStart, weekEnd, isCurrent } = view;

  const wantedTab =
    params.tab === "timer" || params.tab === "insights" ? params.tab : "log";
  // The timer is about now, so it has no meaning in a week that has ended.
  const tab: Tab = wantedTab === "timer" && !isCurrent ? "log" : wantedTab;
  const day = dayWithin(view, typeof params.day === "string" ? params.day : undefined, today);

  const [
    categories,
    weekEntries,
    week,
    running,
    categoryTotals,
    roadmapItems,
    submission,
  ] = await Promise.all([
    getTimeCategories(),
    getWeekEntries(member.id, weekStart),
    getWeekTotal(member.id, weekStart),
    getRunningEntry(member.id),
    getWeekCategoryTotals(member.id, weekStart),
    getRoadmapItems(member.id),
    getWeeklySubmission(member.id, weekStart),
  ]);

  const priming = isCurrent ? primingForWeek(member.onboarding_start_date, today) : null;
  const labelFor = (slug: string) =>
    categories.find((c) => c.slug === slug)?.label ?? slug;

  // Minutes per wall-clock day, for the strip and the by-day chart.
  const minutesByDay = new Map<string, number>();
  for (const entry of weekEntries) {
    const key = dayOf(entry);
    if (key < weekStart || key > weekEnd) continue;
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + (entry.duration_minutes ?? 0));
  }
  const dayEntries = weekEntries.filter((e) => dayOf(e) === day).reverse();

  const remaining = Math.max(0, COMPLETE_WEEK_MINUTES - week.loggedMinutes);
  const progress = weekProgress(week.loggedMinutes, COMPLETE_WEEK_MINUTES);
  const submitted = Boolean(submission?.submitted_at);

  // §9 folds the availability ask into this rhythm rather than making it a
  // separate chore, so it appears here — the screen members already open weekly.
  // Only for active members: pairing is locked until active (§1).
  const pairingAvailability =
    member.status === "active" && isCurrent
      ? await getMyAvailability(member.id, pairingMonth())
      : null;

  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7);
  const range = sameMonth
    ? `${RANGE_DAY.format(new Date(weekStart))} – ${RANGE_FULL.format(new Date(weekEnd))}`
    : `${RANGE_FULL.format(new Date(weekStart))} – ${RANGE_FULL.format(new Date(weekEnd))}`;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <PageHeader title="Your log" tagline="Reflect. Focus. Make it count." />

      <WeekNav view={view} range={range} />

      <Tabs tab={tab} day={day} week={view} />

      {tab === "timer" ? (
        <>
          <TimerPanel categories={categories} running={running} />
          <WeekProgress
            loggedMinutes={week.loggedMinutes}
            isComplete={week.isCompleteWeek}
            remaining={remaining}
            progress={progress}
            className="mt-5"
          />
        </>
      ) : tab === "insights" ? (
        <div className="flex flex-col gap-5">
          <WeekProgress
            loggedMinutes={week.loggedMinutes}
            isComplete={week.isCompleteWeek}
            remaining={remaining}
            progress={progress}
          />
          <HoursByCategory totals={categoryTotals} />
          <HoursByDay weekStart={weekStart} minutesByDay={minutesByDay} />
          {categoryTotals.length === 0 ? (
            <Card>
              <p className="text-small text-ink/70">
                Nothing logged this week yet. The charts fill in as the timer runs.
              </p>
            </Card>
          ) : null}
        </div>
      ) : (
        <>
          {priming ? (
            <Card className="mb-5 bg-lemon/25">
              <Eyebrow tone="accent">While you&rsquo;re here</Eyebrow>
              <h2 className="font-display mt-2 text-heading font-medium text-ink">
                {priming.title}
              </h2>
              <div className="mt-3 flex flex-col gap-3 text-small text-ink/80">
                {priming.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
            </Card>
          ) : null}

          {pairingAvailability && !pairingAvailability.submitted ? (
            <Card className="mb-5 bg-sky/15">
              <Eyebrow>One thing for this month</Eyebrow>
              <p className="mt-1 text-small text-ink/80">
                You haven&rsquo;t said when you could take your peer call yet.
                It takes about ten seconds, and it&rsquo;s what gets you matched.
              </p>
              <p className="mt-3">
                <Link
                  href="/pairing"
                  className="text-small text-ink underline decoration-orange decoration-2 underline-offset-4"
                >
                  Say when you&rsquo;re free
                </Link>
              </p>
            </Card>
          ) : null}

          {/* The calendar. Always here, empty or not (brief A7). */}
          <Card className="mb-5">
            <WeekCalendar
              weekStart={weekStart}
              entries={weekEntries}
              categories={categories}
              selected={day}
              today={today}
              tab={tab}
              week={isCurrent ? undefined : weekStart}
            />
          </Card>

          <WeekProgress
            loggedMinutes={week.loggedMinutes}
            isComplete={week.isCompleteWeek}
            remaining={remaining}
            progress={progress}
            className="mb-6"
          />

          <SectionTitle
            aside={
              <span className="font-mono tabular-nums">
                {formatMinutes(minutesByDay.get(day) ?? 0)}
              </span>
            }
          >
            {day === today ? "Today" : DAY_LONG.format(new Date(day))}
          </SectionTitle>

          {dayEntries.length === 0 ? (
            <Card>
              <p className="text-small text-ink/70">
                {day === today
                  ? "Nothing yet today. Start the timer when you begin something."
                  : "Nothing logged that day."}
              </p>
            </Card>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {dayEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-2xl border border-ink/8 bg-card px-4 py-3 shadow-soft"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-body text-ink">
                          {labelFor(entry.category_slug)}
                          {entry.source === "manual" ? (
                            <span className="ml-2 text-eyebrow font-medium text-ink/40 uppercase">
                              added later
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono text-caption text-ink/50">
                          {TIME.format(new Date(entry.started_at))}
                          {entry.ended_at
                            ? `–${TIME.format(new Date(entry.ended_at))}`
                            : " · running"}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-mono text-small text-ink tabular-nums">
                          {entry.ended_at ? formatMinutes(entry.duration_minutes ?? 0) : ", "}
                        </span>
                        {isCurrent ? (
                          <form action={deleteEntry}>
                            <input type="hidden" name="id" value={entry.id} />
                            <button
                              type="submit"
                              className="text-caption text-ink/40 underline underline-offset-4 transition hover:text-ink"
                              aria-label={`Delete ${labelFor(entry.category_slug)} entry`}
                            >
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    {/* A plain <details> rather than a client component: no
                        JavaScript to load, works before hydration, and keeps the
                        note as genuinely optional furniture. In a past week the
                        note is read as written, with nothing to write into. */}
                    {!isCurrent ? (
                      entry.note ? (
                        <p className="mt-1 text-caption text-ink/70 italic">{entry.note}</p>
                      ) : null
                    ) : (
                    <details className="group mt-1">
                      <summary className="cursor-pointer list-none text-caption text-ink/50 transition hover:text-ink">
                        {entry.note ? (
                          <span className="text-ink/70 italic">{entry.note}</span>
                        ) : (
                          <span className="underline underline-offset-4">Add a note</span>
                        )}
                      </summary>
                      <form action={updateEntryNote} className="mt-2 flex flex-wrap items-center gap-2">
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
                          className="min-w-0 flex-1 rounded-xl border border-ink/12 bg-cream-deep px-3 py-1.5 text-small text-ink placeholder:text-ink/40"
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-ink/20 px-3.5 py-1.5 text-small font-medium text-ink transition hover:border-ink/40"
                        >
                          Save
                        </button>
                      </form>
                    </details>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {isCurrent ? (
            <div className="mt-6">
              <ManualEntryForm categories={categories} today={day} />
            </div>
          ) : null}

          <SectionTitle className="mt-10">
            {isCurrent ? "Sign off the week" : "How the week was signed off"}
          </SectionTitle>

          {submitted ? (
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Eyebrow>Signed</Eyebrow>
                  <p className="mt-2 text-small text-ink/80">
                    {isCurrent
                      ? "This week’s log is in. Your time keeps tracking. The entry itself stays as written."
                      : "Signed off and left alone, as written at the time."}
                  </p>
                </div>
                <FattoStamp className="mt-1 shrink-0" />
              </div>
              {submission?.other_activity ? (
                <p className="mt-3 border-l-2 border-orange/40 pl-3 text-small text-ink/70 italic">
                  {submission.other_activity}
                </p>
              ) : null}
            </Card>
          ) : isCurrent ? (
            <WeeklyLogForm
              roadmapItems={roadmapItems}
              defaultOtherActivity={submission?.other_activity ?? ""}
              actionsTaken={submission?.actions_taken ?? {}}
            />
          ) : (
            // A week that closed unsigned stays unsigned. Saying so plainly
            // beats an empty space, and beats a form that would rewrite
            // history if it were offered.
            <Card>
              <Eyebrow>Not signed</Eyebrow>
              <p className="mt-2 text-small text-ink/80">
                This week went by without a sign-off. The time logged in it
                still counts — hours reclaimed are banked from the ledger, not
                from the sign-off.
              </p>
            </Card>
          )}

          {running && isCurrent ? (
            <p className="mt-6 text-small text-ink/60">
              A timer is still running. It&rsquo;ll count once you stop it.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

/** Log / Timer / Insights, as links — each tab is a URL. */
function Tabs({ tab, day, week }: { tab: Tab; day: string; week: WeekView }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "log", label: "Log" },
    // The timer runs now. In a week that has ended there is nothing for it
    // to do, so it isn't offered rather than being offered and refusing.
    ...(week.isCurrent ? [{ key: "timer" as const, label: "Timer" }] : []),
    { key: "insights", label: "Insights" },
  ];
  const weekParam = week.isCurrent ? "" : `&week=${week.weekStart}`;
  return (
    <nav aria-label="Log sections" className="mb-5 flex gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/log?day=${day}${t.key === "log" ? "" : `&tab=${t.key}`}${weekParam}`}
          aria-current={tab === t.key ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-small font-medium transition ${
            tab === t.key ? "bg-ink text-cream" : "bg-cream-deep text-ink/70 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Paging between weeks (Dom, 30 Sep).
 *
 * Arrows either side of the date range, and a way back to this week from
 * wherever they have got to. The read-only state is said in words under it
 * rather than left to be inferred from a missing button.
 */
function WeekNav({ view, range }: { view: WeekView; range: string }) {
  const arrow = "flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-cream-deep";
  return (
    <nav aria-label="Which week" className="mb-4 flex flex-col items-center gap-1">
      <div className="flex w-full items-center justify-between gap-2">
        {view.previous ? (
          <Link href={`/log?week=${view.previous}`} aria-label="The week before" className={arrow}>
            <Chevron className="rotate-180" />
          </Link>
        ) : (
          <span aria-hidden className="size-9 shrink-0" />
        )}

        <p className="text-center text-small font-medium text-ink">{range}</p>

        {view.next ? (
          <Link href={`/log?week=${view.next}`} aria-label="The week after" className={arrow}>
            <Chevron />
          </Link>
        ) : (
          <span aria-hidden className="size-9 shrink-0" />
        )}
      </div>

      {view.isCurrent ? null : (
        <p className="text-caption text-ink/60">
          A week you&rsquo;ve already lived — reading only.{" "}
          <Link href="/log" className="underline underline-offset-2 hover:text-ink">
            Back to this week
          </Link>
        </p>
      )}
    </nav>
  );
}

function WeekProgress({
  loggedMinutes,
  isComplete,
  remaining,
  progress,
  className = "",
}: {
  loggedMinutes: number;
  isComplete: boolean;
  remaining: number;
  progress: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <Eyebrow>Tracked this week</Eyebrow>
          <p className="font-mono mt-1 text-title text-ink tabular-nums">
            {formatMinutes(loggedMinutes)}
          </p>
        </div>
        <p className="max-w-[14rem] text-right text-small text-ink/70">
          {/* Ten hours is the prize-draw line, not what makes a week count
              (round 4, item 22). The ledger accrues regardless. */}
          {isComplete
            ? "Ten hours logged. You’re eligible for this month’s prize draw."
            : `${formatMinutes(remaining)} more makes you eligible for this month’s prize draw.`}
        </p>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink/8"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward ten hours, the prize-draw line"
      >
        <div
          className={`h-full rounded-full transition-all ${isComplete ? "bg-ink" : "bg-orange"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </Card>
  );
}
