import Link from "next/link";

import { bucketColour } from "@/lib/log/palette";
import type { TimeCategory, TimeEntry } from "@/lib/timer/queries";
import { formatMinutes } from "@/lib/timer/format";
import { utcToWallClock } from "@/lib/time-zone";
import { addDays } from "@/lib/onboarding/cadence";

/**
 * The week as a calendar — L'Editoriale "07 Your Log", Log tab.
 *
 * Seven columns, Monday to Sunday, the hours down the side, every entry a
 * block in its day coloured by the category's bucket. **Always drawn**, empty
 * or not: an empty week is a grid with nothing in it, which tells you the
 * calendar exists and the week is empty. The first version of this drew a
 * single day and only when that day had entries, so a member with nothing
 * logged today saw no calendar at all and, reasonably, reported it missing.
 *
 * The day letters across the top are the selector: tap one and the entry list
 * under the calendar shows that day. Links, not buttons, so every day is a URL
 * and nothing here needs JavaScript.
 *
 * On a phone seven columns are narrow, so blocks are colour-only there and
 * carry their label in a tooltip; the selected day's entries, with labels,
 * are the list beneath. On a laptop the blocks are wide enough to name.
 *
 * See palette.ts for why colour follows the bucket rather than the category.
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
const PX_PER_HOUR = 40;

export function WeekCalendar({
  weekStart,
  entries,
  categories,
  selected,
  today,
  tab,
}: {
  weekStart: string;
  entries: TimeEntry[];
  categories: TimeCategory[];
  selected: DayKey;
  today: DayKey;
  tab: string;
}) {
  const byslug = new Map(categories.map((c) => [c.slug, c]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const placed = entries
    .map((entry) => {
      const start = minuteOfDay(entry.started_at);
      const minutes = entry.ended_at
        ? Math.max(1, minuteOfDay(entry.ended_at) - start)
        : Math.max(1, entry.duration_minutes ?? 15);
      return { entry, day: dayOf(entry), start, minutes };
    })
    .filter((p) => days.includes(p.day));

  // Visible range: 08:00–20:00 by default, widened to whatever the week holds.
  const from = Math.min(8 * 60, ...placed.map((p) => Math.floor(p.start / 60) * 60));
  const to = Math.max(20 * 60, ...placed.map((p) => Math.ceil((p.start + p.minutes) / 60) * 60));
  const span = to - from;
  const height = (span / 60) * PX_PER_HOUR;

  const totals = new Map<DayKey, number>();
  for (const p of placed) totals.set(p.day, (totals.get(p.day) ?? 0) + p.minutes);

  return (
    <div>
      {/* Day headers: the selector. */}
      <div className="grid grid-cols-[2.25rem_repeat(7,1fr)] gap-1">
        <span aria-hidden />
        {days.map((day, i) => {
          const current = day === selected;
          const isToday = day === today;
          const minutes = totals.get(day) ?? 0;
          return (
            <Link
              key={day}
              href={`/log?day=${day}${tab !== "log" ? `&tab=${tab}` : ""}`}
              aria-current={current ? "date" : undefined}
              aria-label={`${LETTERS[i]}, ${day}${minutes ? `, ${formatMinutes(minutes)} logged` : ""}`}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full text-small font-medium transition sm:size-9 ${
                  current
                    ? "bg-orange text-ink shadow-soft"
                    : isToday
                      ? "bg-cream-deep text-ink"
                      : day > today
                        ? "text-ink/35"
                        : "text-ink/70 hover:bg-cream-deep"
                }`}
              >
                {LETTERS[i]}
              </span>
              <span className="font-mono text-[0.6rem] text-ink/45 tabular-nums">
                {minutes ? formatMinutes(minutes) : "·"}
              </span>
            </Link>
          );
        })}
      </div>

      {/* The grid. */}
      <div
        className="relative mt-2 grid grid-cols-[2.25rem_repeat(7,1fr)] gap-1"
        style={{ height }}
        aria-hidden
      >
        {/* Hour labels and lines. Recessive by design. */}
        <div className="relative">
          {Array.from({ length: span / 60 + 1 }, (_, i) => from + i * 60).map((m) => (
            <span
              key={m}
              className="font-mono absolute right-1 -translate-y-1/2 text-[0.6rem] text-ink/40 tabular-nums"
              style={{ top: ((m - from) / span) * height }}
            >
              {String(m / 60).padStart(2, "0")}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const current = day === selected;
          return (
            <div
              key={day}
              className={`relative overflow-hidden rounded-lg ${current ? "bg-orange/8" : "bg-cream-deep/60"}`}
            >
              {Array.from({ length: span / 60 }, (_, i) => i + 1).map((h) => (
                <span
                  key={h}
                  className="absolute inset-x-0 h-px bg-ink/6"
                  style={{ top: (h * 60 / span) * height }}
                />
              ))}

              {placed
                .filter((p) => p.day === day)
                .map(({ entry, start, minutes }) => {
                  const category = byslug.get(entry.category_slug);
                  const label = category?.label ?? entry.category_slug;
                  const top = ((start - from) / span) * height;
                  const h = Math.max(6, (minutes / span) * height);
                  return (
                    <div
                      key={entry.id}
                      className="absolute inset-x-0.5 overflow-hidden rounded-md px-1 py-0.5 text-white shadow-soft"
                      style={{ top: top + 1, height: h - 2, backgroundColor: bucketColour(category?.bucket) }}
                      title={`${label} · ${formatMinutes(minutes)}${entry.note ? ` · ${entry.note}` : ""}`}
                    >
                      {/* Named only where it fits: on a laptop, or a long block. */}
                      <span className="hidden truncate text-[0.62rem] leading-tight font-medium sm:block">
                        {h >= 22 ? label : ""}
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-caption text-ink/45">
        Colour is the kind of work — Systems, Profit, Visibility. Tap a day for its entries.
      </p>
    </div>
  );
}
