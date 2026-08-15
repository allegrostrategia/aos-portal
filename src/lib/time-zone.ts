/**
 * One timezone for the whole product.
 *
 * aOS runs on UK time: the hot seat, the Monday window, the weekly cadence. The
 * server runs in UTC, members' browsers run wherever they are, and the database
 * stores instants — so "when is the session" has three possible answers unless
 * one is chosen and used everywhere.
 *
 * Two bugs came from not doing this. A `datetime-local` value carries no offset,
 * so `new Date("2026-08-16T23:00")` on a UTC server read 23:00 UK as 23:00 UTC
 * and stored the session an hour late. And screens that formatted without a
 * timeZone rendered in the server's zone while emails rendered in London's, so
 * the same session showed as Sunday in one place and Monday in another.
 */

export const APP_TIME_ZONE = "Europe/London";

/** How far `timeZone` is ahead of UTC at a given instant, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;

  const asIfUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    // Intl renders midnight as "24" in some environments.
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  );

  return asIfUtc - instant.getTime();
}

/**
 * Turn a wall-clock string with no offset — what `<input type="datetime-local">`
 * produces — into the instant it means in `timeZone`.
 *
 * Resolved in two passes because the offset depends on the instant we're still
 * working out: the first pass guesses, the second corrects it using the guess.
 * That's exact everywhere except inside a DST transition, where an hour either
 * doesn't exist or happens twice and no answer is fully right.
 */
export function wallClockToUtc(
  local: string,
  timeZone: string = APP_TIME_ZONE,
): Date {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const asIfUtc = new Date(`${withSeconds}Z`);

  const firstGuess = new Date(asIfUtc.getTime() - offsetMsAt(asIfUtc, timeZone));
  return new Date(asIfUtc.getTime() - offsetMsAt(firstGuess, timeZone));
}

/** The reverse: an instant as a wall-clock string, for pre-filling a form. */
export function utcToWallClock(
  instant: Date | string,
  timeZone: string = APP_TIME_ZONE,
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const shifted = new Date(date.getTime() + offsetMsAt(date, timeZone));
  return shifted.toISOString().slice(0, 16);
}

const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

/** "Sunday 16 August at 23:00" — always UK time, wherever this runs. */
export function formatSessionTime(instant: Date | string): string {
  return LONG.format(typeof instant === "string" ? new Date(instant) : instant);
}

/** "Sun 16 Aug, 23:00" — the compact form for lists. */
export function formatSessionTimeShort(instant: Date | string): string {
  return SHORT.format(typeof instant === "string" ? new Date(instant) : instant);
}
