import Link from "next/link";

import { bucketColour } from "@/lib/log/palette";
import type { TimeCategory, TimeEntry } from "@/lib/timer/queries";
import { formatMinutes } from "@/lib/timer/format";
import { utcToWallClock } from "@/lib/time-zone";
import { addDays } from "@/lib/onboarding/cadence";

/**
 * The week, day by day — L'Editoriale "07 Your Log", Log tab.
 *
 * Two pieces. The **day strip** is the M T W T F S S selector from the
 * reference, with a bar under each letter for how much was logged that day, so
 * the week's shape is visible before a day is picked. The **day timeline** is
 * the selected day's entries as blocks against the hours, coloured by the
 * category's bucket and labelled with the category itself — see palette.ts for
 * why bucket rather than category carries the colour.
 *
 * One day at a time rather than seven columns: on a phone seven columns of
 * time blocks are unreadable, and the brief's "day by day" is exactly that.
 * The selector is a set of links (`?day=`), so it works without JavaScript and
 * every day is a URL.
 */

export type DayKey = string; // YYYY-MM-DD, wall clock

export function dayOf(entry: TimeEntry): DayKey {
  return utcToWallClock(entry.started_at).slice(0, 10);
}

function minuteOfDay(instant: string): number {
  const wall = utcToWallClock(instant);
  return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
}

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function DayStrip({
  weekStart,
  selected,
  minutesByDay,
  today,
  tab,
}: {
  weekStart: string;
  selected: DayKey;
  minutesByDay: Map<DayKey, number>;
  today: DayKey;
  tab: string;
}) {
  const max = Math.max(60, ...minutesByDay.values());

  return (
    <nav aria-label="Day" className="flex justify-between gap-1">
      {LETTERS.map((letter, i) => {
        const day = addDays(weekStart, i);
        const minutes = minutesByDay.get(day) ?? 0;
        const current = day === selected;
        const isToday = day === today;
        const future = day > today;
        const href = `/log?day=${day}${tab !== "log" ? `&tab=${tab}` : ""}`;

        return (
          <Link
            key={day}
            href={href}
            aria-current={current ? "date" : undefined}
            aria-label={`${letter}, ${day}${minutes ? `, ${formatMinutes(minutes)} logged` : ""}`}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span
              className={`flex size-9 items-center justify-center rounded-full text-small font-medium transition ${
                current
                  ? "bg-orange text-white shadow-soft"
                  : isToday
                    ? "bg-cream-deep text-ink"
                    : future
                      ? "text-ink/35"
                      : "text-ink/70 hover:bg-cream-deep"
              }`}
            >
              {letter}
            </span>
            {/* The day's total, as a bar. Recessive by design. */}
            <span className="flex h-6 w-1.5 items-end overflow-hidden rounded-full bg-ink/6">
              <span
                className={`block w-full rounded-full ${current ? "bg-orange" : "bg-ink/35"}`}
                style={{ height: `${Math.round((minutes / max) * 100)}%` }}
              />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DayTimeline({
  entries,
  categories,
}: {
  entries: TimeEntry[];
  categories: TimeCategory[];
}) {
  if (entries.length === 0) return null;

  const byslug = new Map(categories.map((c) => [c.slug, c]));

  // Visible range: 06:00–22:00, widened to whatever the day actually holds.
  const starts = entries.map((e) => minuteOfDay(e.started_at));
  const ends = entries.map((e) =>
    e.ended_at ? minuteOfDay(e.ended_at) : minuteOfDay(e.started_at) + (e.duration_minutes ?? 0),
  );
  const from = Math.min(6 * 60, ...starts.map((m) => Math.floor(m / 60) * 60));
  const to = Math.max(22 * 60, ...ends.map((m) => Math.ceil(m / 60) * 60));
  const span = to - from;
  const PX_PER_HOUR = 44;
  const height = (span / 60) * PX_PER_HOUR;

  return (
    <div className="relative" style={{ height }} aria-hidden>
      {/* Hour lines. One-step-off-surface, hairline, recessive. */}
      {Array.from({ length: span / 60 + 1 }, (_, i) => from + i * 60).map((m) => (
        <div
          key={m}
          className="absolute inset-x-0 flex items-start gap-2"
          style={{ top: ((m - from) / span) * height }}
        >
          <span className="font-mono w-10 -translate-y-1/2 text-right text-caption text-ink/40 tabular-nums">
            {String(m / 60).padStart(2, "0")}:00
          </span>
          <span className="mt-px h-px flex-1 bg-ink/8" />
        </div>
      ))}

      {/* Blocks. A 2px surface gap between touching blocks comes from the
          rounded corners and the 1px inset; overlaps (a manual entry over a
          timed one) simply stack. */}
      {entries.map((entry) => {
        const start = minuteOfDay(entry.started_at);
        const minutes = entry.ended_at
          ? Math.max(1, minuteOfDay(entry.ended_at) - start)
          : Math.max(1, entry.duration_minutes ?? 15);
        const category = byslug.get(entry.category_slug);
        const colour = bucketColour(category?.bucket);
        const top = ((start - from) / span) * height;
        const h = Math.max(18, (minutes / span) * height);

        return (
          <div
            key={entry.id}
            className="absolute right-0 left-12 overflow-hidden rounded-lg px-2.5 py-1 text-white shadow-soft"
            style={{ top: top + 1, height: h - 2, backgroundColor: colour }}
            title={`${category?.label ?? entry.category_slug} · ${formatMinutes(minutes)}`}
          >
            <p className="truncate text-caption font-medium leading-tight">
              {category?.label ?? entry.category_slug}
              {!entry.ended_at ? " · running" : ""}
            </p>
            {h >= 34 ? (
              <p className="font-mono truncate text-[0.65rem] text-white/85 tabular-nums">
                {formatMinutes(minutes)}
                {entry.note ? ` · ${entry.note}` : ""}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
