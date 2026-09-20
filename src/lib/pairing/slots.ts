/**
 * When somebody can take a peer call (§9) — real dates, real times.
 *
 * Replaced the weekday × part-of-day grid on 21 September 2026 (brief:
 * `docs/aOS_Peer_Pairing_Date_Availability_Brief.md`). Nina's reasoning: nobody
 * is free every Monday afternoon, so a recurring pattern never represented
 * anyone's actual diary and an "overlap" found in it was a guess. A slot is now
 * one hour on one date, and two people sharing one are genuinely both free.
 *
 * A slot id is the UK wall-clock start, `2026-10-06T14:00` — the same shape a
 * `datetime-local` input produces, sortable as text, and readable in a database
 * row without decoding. Weekdays only, on the hour from nine to eight (Dom,
 * 20 Sep: 9am–8pm, no weekends): a business conversation between two founders
 * who may only be free after the day's work, but not on a Saturday. Either
 * bound is one constant away.
 */

export type SlotId = string;

/** Start hours offered, UK time. 9am to 8pm inclusive. */
export const SLOT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

const SLOT_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;

function isoWeekday(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** "2026-10-06T14:00" → { date: "2026-10-06", hour: 14 }, or null if malformed. */
export function parseSlot(slot: string): { date: string; hour: number } | null {
  const m = SLOT_SHAPE.exec(slot);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  // Round-tripping catches 31 June and the like.
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  return { date, hour: Number(m[4]) };
}

/**
 * A slot the grid would actually offer: well-formed, a weekday, an offered
 * hour and — when a month is given — inside that month. Anything else is
 * dropped rather than trusted; a made-up key would match nothing and quietly
 * cost somebody a call.
 */
export function isSlot(value: string, month?: string): boolean {
  const parsed = parseSlot(value);
  if (!parsed) return false;
  if (isoWeekday(parsed.date) > 5) return false;
  if (!(SLOT_HOURS as readonly number[]).includes(parsed.hour)) return false;
  if (month && parsed.date.slice(0, 7) !== month.slice(0, 7)) return false;
  return true;
}

/** Every weekday in the month from `from` onward, so past days aren't offered. */
export function weekdaysInMonth(month: string, from = month): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const cursor = new Date(Date.UTC(y, m - 1, 1));
  while (cursor.getUTCMonth() === m - 1) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isoWeekday(iso) <= 5 && iso >= from) out.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function slotId(date: string, hour: number): SlotId {
  return `${date}T${String(hour).padStart(2, "0")}:00`;
}

/** The grid: each offered date with its offered slots, in order. */
export function slotsForMonth(
  month: string,
  from = month,
): { date: string; slots: SlotId[] }[] {
  return weekdaysInMonth(month, from).map((date) => ({
    date,
    slots: SLOT_HOURS.map((hour) => slotId(date, hour)),
  }));
}

/** "9am", "12pm", "2pm". */
export function hourLabel(hour: number): string {
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const DAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Tuesday 6 October" — a date as written, never shifted (see time-zone.ts). */
export function dateLabel(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

/** "Tue 6 Oct", for the grid's row headers. */
export function dateLabelShort(date: string): string {
  return DAY_SHORT.format(new Date(`${date}T00:00:00Z`));
}

/** "2pm on Tuesday 6 October" — the shape the overlap message uses. */
export function slotLabel(slot: SlotId): string {
  const parsed = parseSlot(slot);
  if (!parsed) return slot;
  return `${hourLabel(parsed.hour)} on ${dateLabel(parsed.date)}`;
}

/** "2pm Tue 6 Oct" — for lists. */
export function slotLabelShort(slot: SlotId): string {
  const parsed = parseSlot(slot);
  if (!parsed) return slot;
  return `${hourLabel(parsed.hour)} ${dateLabelShort(parsed.date)}`;
}

/**
 * What two people both picked, earliest first. Slot ids sort chronologically
 * as text, so no parsing is needed to order them.
 */
export function sharedSlots(a: SlotId[], b: SlotId[]): SlotId[] {
  const theirs = new Set(b);
  return [...new Set(a)].filter((slot) => theirs.has(slot)).sort();
}

/**
 * Reads whatever is in the `availability` jsonb column.
 *
 * The column is free-shape, and rows written before 21 September 2026 held
 * weekday keys ("tue-pm"); the migration of that date strips them, but this
 * drops anything unrecognised regardless, so a stale value can never look like
 * a date somebody chose.
 */
export function readSlots(value: unknown, month?: string): SlotId[] {
  if (!value || typeof value !== "object") return [];
  const slots = (value as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  return [...new Set(
    slots.filter((s): s is string => typeof s === "string" && isSlot(s, month)),
  )].sort();
}
