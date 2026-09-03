/**
 * When somebody can take a peer call (§9).
 *
 * A fixed grid of weekday × part-of-day rather than free text or a calendar.
 * Overlap has to be computable — the whole reason availability is collected is
 * to find a time two people share — and comparing arbitrary text can't do that.
 * Fifteen tick boxes is also something you can actually complete on a phone in
 * the ten seconds this deserves, which matters when §9 asks for it to be folded
 * into the existing rhythm rather than become a separate chore.
 *
 * Weekdays only: this is a business conversation between two founders, and
 * offering weekends invites a commitment neither of them wants to make.
 */

export const SLOT_DAYS = [
  { key: "mon", label: "Monday", isoWeekday: 1 },
  { key: "tue", label: "Tuesday", isoWeekday: 2 },
  { key: "wed", label: "Wednesday", isoWeekday: 3 },
  { key: "thu", label: "Thursday", isoWeekday: 4 },
  { key: "fri", label: "Friday", isoWeekday: 5 },
] as const;

export const SLOT_PERIODS = [
  { key: "am", label: "Morning", hour: 9 },
  { key: "pm", label: "Afternoon", hour: 14 },
  { key: "eve", label: "Evening", hour: 18 },
] as const;

export type SlotId = string;

export function allSlots(): SlotId[] {
  return SLOT_DAYS.flatMap((day) =>
    SLOT_PERIODS.map((period) => `${day.key}-${period.key}`),
  );
}

export function isSlot(value: string): boolean {
  return allSlots().includes(value);
}

/** "tue-pm" → "Tuesday afternoon", for telling a pair what they share. */
export function slotLabel(slot: SlotId): string {
  const [dayKey, periodKey] = slot.split("-");
  const day = SLOT_DAYS.find((d) => d.key === dayKey);
  const period = SLOT_PERIODS.find((p) => p.key === periodKey);
  if (!day || !period) return slot;
  return `${day.label} ${period.label.toLowerCase()}`;
}

/** What two people both ticked, in the grid's own order rather than either's. */
export function sharedSlots(a: SlotId[], b: SlotId[]): SlotId[] {
  const theirs = new Set(b);
  return allSlots().filter((slot) => a.includes(slot) && theirs.has(slot));
}

/**
 * Reads whatever is in the `availability` jsonb column.
 *
 * The column was left free-shape in Step 1 "while the availability UI is
 * undecided", so anything already written could be any shape at all. Unknown
 * slots are dropped rather than trusted — a stale key would otherwise match
 * nothing and quietly cost somebody a pairing.
 */
export function readSlots(value: unknown): SlotId[] {
  if (!value || typeof value !== "object") return [];
  const slots = (value as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  return slots.filter((s): s is string => typeof s === "string" && isSlot(s));
}
