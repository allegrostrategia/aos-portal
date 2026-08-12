/**
 * Duration formatting.
 *
 * Two different jobs, deliberately kept apart: a running timer reads like a
 * stopwatch (`1:23:45`) because it's counting; a logged total reads like an
 * amount (`3h 20m`) because it's a quantity. Using one format for both makes
 * totals look like clocks.
 */

/** A running stopwatch: h:mm:ss, or m:ss under an hour. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

/** A logged amount: "3h 20m", "45m", "0m". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const hours = Math.floor(m / 60);
  const rest = m % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Progress toward the week's ten hours, capped so the bar can't overflow. */
export function weekProgress(loggedMinutes: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((loggedMinutes / target) * 100));
}
