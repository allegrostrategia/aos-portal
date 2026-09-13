"use client";

import { startTimer, stopTimer } from "@/lib/timer/actions";
import { formatElapsed } from "@/lib/timer/format";
import type { TimeCategory, TimeEntry } from "@/lib/timer/queries";
import { useNowSeconds } from "@/components/timer/floating-timer";
import { Card } from "@/components/ui/card";

/**
 * The Timer tab — L'Editoriale "07 Your Log", where the timer is the big
 * orange moment on the page rather than a pill in the corner.
 *
 * Same actions and the same clock as the floating timer; only the presentation
 * differs. The brief is explicit that the timer's logic doesn't change, so
 * there is one `startTimer` and one `stopTimer`, and both surfaces call them.
 * Elapsed time is derived from `started_at` for the reasons the floating timer
 * gives — it survives a reload, a sleeping phone, a closed lid.
 */
export function TimerPanel({
  categories,
  running,
}: {
  categories: TimeCategory[];
  running: TimeEntry | null;
}) {
  const nowSeconds = useNowSeconds();
  const seconds =
    nowSeconds === null || !running
      ? null
      : nowSeconds - Math.floor(new Date(running.started_at).getTime() / 1000);
  const label = running
    ? (categories.find((c) => c.slug === running.category_slug)?.label ?? running.category_slug)
    : null;

  return (
    <Card tone="orange" className="text-center">
      {running ? (
        <>
          <p className="text-eyebrow font-medium uppercase text-white/80">{label}</p>
          <p
            className="font-mono mt-4 text-[3.5rem] leading-none tabular-nums sm:text-[4.5rem]"
            aria-live="off"
          >
            {seconds === null ? "0:00" : formatElapsed(seconds)}
          </p>
          {running.note ? (
            <p className="mt-3 text-small text-white/85 italic">{running.note}</p>
          ) : null}
          <form action={stopTimer} className="mt-8">
            <button
              type="submit"
              className="inline-flex size-20 items-center justify-center rounded-full bg-white text-orange shadow-lift transition hover:scale-105"
              aria-label="Stop the timer"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-7" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </form>
          <p className="mt-4 text-caption text-white/75">Running — stop it when you switch.</p>
        </>
      ) : (
        <form action={startTimer} className="mx-auto flex max-w-sm flex-col items-center">
          <p className="text-eyebrow font-medium uppercase text-white/80">Focus time</p>
          <p className="font-mono mt-4 text-[3.5rem] leading-none tabular-nums sm:text-[4.5rem]">
            0:00
          </p>

          <label htmlFor="timer-category" className="sr-only">
            What are you working on?
          </label>
          <select
            id="timer-category"
            name="category_slug"
            defaultValue=""
            required
            className="mt-8 w-full rounded-full border border-white/40 bg-white/15 px-4 py-2.5 text-body text-white outline-none focus:border-white focus:ring-2 focus:ring-white/40 [&>option]:text-ink"
          >
            <option value="" disabled>
              What are you working on?
            </option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label}
              </option>
            ))}
          </select>

          <label htmlFor="timer-note" className="sr-only">
            What specifically? Optional.
          </label>
          <input
            id="timer-note"
            name="note"
            type="text"
            placeholder="What specifically? (optional)"
            className="mt-3 w-full rounded-full border border-white/30 bg-white/10 px-4 py-2.5 text-small text-white placeholder:text-white/60 outline-none focus:border-white"
          />

          <button
            type="submit"
            className="mt-8 inline-flex size-20 items-center justify-center rounded-full bg-white text-orange shadow-lift transition hover:scale-105"
            aria-label="Start the timer"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="ml-1 size-7" fill="currentColor">
              <path d="M7 5v14l11-7z" />
            </svg>
          </button>
        </form>
      )}
    </Card>
  );
}
