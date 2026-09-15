import { APP_TIME_ZONE, wallClockToUtc } from "../time-zone.ts";

/**
 * A channel's posting window (round 3, §A): Weekly Check-Ins is open on
 * Mondays, 2:00 to 3:30pm UK time, and readable the rest of the week.
 *
 * The database enforces this in the insert policy through
 * `chat_channel_open()`; this is the same rule in TypeScript, for the screen
 * (a locked state that says when it opens next) and for the action (a
 * friendly refusal instead of a policy error). Same numbers, from the same
 * row, so the two cannot disagree about the hours; they could disagree about
 * the clock only if the server's idea of UK time differed from Postgres's,
 * and both use the Europe/London zone database.
 *
 * Pure: takes the instant, so the tests can ask about any Monday.
 */

export type ChannelWindow = {
  window_weekday: number | null;
  window_start: string | null;
  window_end: string | null;
};

export type WindowState =
  | { kind: "always" }
  | { kind: "open"; closesAt: Date }
  | { kind: "closed"; opensAt: Date; closesAt: Date };

/** YYYY-MM-DD of `instant` on the UK wall clock. */
function ukDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** ISO weekday (1 = Monday) of a YYYY-MM-DD, as a calendar date. */
function isoWeekday(date: string): number {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The window's bounds on the UK calendar date `date`, as instants. */
function boundsOn(date: string, start: string, end: string): { from: Date; to: Date } {
  return {
    from: wallClockToUtc(`${date}T${start.slice(0, 5)}`),
    to: wallClockToUtc(`${date}T${end.slice(0, 5)}`),
  };
}

export function windowState(channel: ChannelWindow, now: Date = new Date()): WindowState {
  if (channel.window_weekday === null || !channel.window_start || !channel.window_end) {
    return { kind: "always" };
  }
  const today = ukDate(now);
  const daysUntil = (channel.window_weekday - isoWeekday(today) + 7) % 7;

  // This week's occurrence, which may already be over.
  const thisWeek = boundsOn(addDays(today, daysUntil), channel.window_start, channel.window_end);
  if (now >= thisWeek.from && now < thisWeek.to) return { kind: "open", closesAt: thisWeek.to };
  if (now < thisWeek.from) return { kind: "closed", opensAt: thisWeek.from, closesAt: thisWeek.to };

  const nextWeek = boundsOn(addDays(today, daysUntil + 7), channel.window_start, channel.window_end);
  return { kind: "closed", opensAt: nextWeek.from, closesAt: nextWeek.to };
}

export function isOpen(channel: ChannelWindow, now: Date = new Date()): boolean {
  return windowState(channel, now).kind !== "closed";
}
