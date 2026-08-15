"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { startTimer, stopTimer } from "@/lib/timer/actions";
import { formatElapsed } from "@/lib/timer/format";
import type { TimeCategory, TimeEntry } from "@/lib/timer/queries";

/**
 * The floating global timer (§3, §4) — live start/stop through the day, from
 * wherever the member happens to be in the portal.
 *
 * Elapsed time is derived from `started_at`, which the server set, rather than
 * counted up locally. So the number survives a reload, a phone going to sleep,
 * a tab left in the background for two hours, and a laptop lid closing — none of
 * which a local counter survives, and all of which happen daily.
 */
/**
 * The wall clock, in whole seconds.
 *
 * `useSyncExternalStore` rather than an effect that sets state on a timer: the
 * clock is external state React is subscribing to, not derived state to keep in
 * sync, and this is the shape React provides for exactly that. It also gives a
 * separate server snapshot, so the markup doesn't disagree with itself at
 * hydration — a clock rendered on the server is wrong by the time it reaches the
 * browser.
 *
 * Flooring to seconds matters: getSnapshot has to return a stable value within a
 * render pass, and raw `Date.now()` changes on every call.
 */
function useNowSeconds(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, 1000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 1000),
    () => null, // server: nothing sensible to say about "now"
  );
}

export function FloatingTimer({
  categories,
  running,
}: {
  categories: TimeCategory[];
  running: TimeEntry | null;
}) {
  const [picking, setPicking] = useState(false);
  const nowSeconds = useNowSeconds();

  const startedAt = running?.started_at ?? null;
  const seconds =
    nowSeconds === null || startedAt === null
      ? null
      : nowSeconds - Math.floor(new Date(startedAt).getTime() / 1000);

  const categoryLabel = running
    ? (categories.find((c) => c.slug === running.category_slug)?.label ??
      running.category_slug)
    : null;

  return (
    // Sits above the mobile bottom bar, and out of the way on desktop.
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:justify-end">
      {running ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-navy/15 bg-white/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur">
          <span
            aria-hidden
            className="size-2 animate-pulse rounded-full bg-orange"
          />
          <div className="min-w-0">
            <p className="truncate text-caption text-navy/60">{categoryLabel}</p>
            <p
              className="font-mono text-small text-navy tabular-nums"
              // Announced only when it settles, not every second — a timer
              // reading itself aloud once a second is unusable.
              aria-live="off"
            >
              {seconds === null ? "0:00" : formatElapsed(seconds)}
            </p>
          </div>
          <form action={stopTimer}>
            <button
              type="submit"
              className="rounded-full bg-navy px-4 py-2 text-small font-medium text-white transition hover:bg-navy/90"
            >
              Stop
            </button>
          </form>
        </div>
      ) : picking ? (
        <form
          action={startTimer}
          // Collapse on submit rather than syncing from `running` in an effect —
          // so stopping a timer later doesn't spring the picker back open.
          onSubmit={() => setPicking(false)}
          className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border border-navy/15 bg-white/95 p-2 shadow-lg backdrop-blur"
        >
          <label htmlFor="category_slug" className="sr-only">
            What are you working on?
          </label>
          <select
            id="category_slug"
            name="category_slug"
            defaultValue=""
            required
            className="min-w-0 flex-1 rounded-md border border-navy/15 bg-white px-3 py-2 text-body text-navy"
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
          <button
            type="submit"
            className="rounded-md bg-navy px-4 py-2 text-small font-medium text-white transition hover:bg-navy/90"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="px-2 text-small text-navy/60 transition hover:text-navy"
            aria-label="Close"
          >
            ✕
          </button>
        </form>
      ) : (
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-navy/15 bg-white/90 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-full px-4 py-2 text-small font-medium text-navy transition hover:bg-navy/5"
          >
            Start timer
          </button>
          <Link
            href="/log"
            className="rounded-full px-3 py-2 text-small text-navy/60 transition hover:bg-navy/5 hover:text-navy"
          >
            Log
          </Link>
        </div>
      )}
    </div>
  );
}
