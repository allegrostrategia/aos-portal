/**
 * Where one person's run of messages starts and ends (round 6 §4).
 *
 * Nina's note was that every message repeated the name and the face. So a
 * run by one sender is drawn once: the face and name at the top, the tail on
 * the last bubble, tighter spacing in between.
 *
 * **Five minutes ends a run as well as a change of sender.** Two messages an
 * hour apart are two arrivals however wrote them, and grouping them would
 * put one name over a conversation that paused overnight.
 *
 * Pure, and separate from the page, because this is the kind of rule that
 * quietly stops working — a grouped thread and an ungrouped one both look
 * plausible, and only the boundaries tell them apart.
 */

export const GROUP_GAP_MS = 5 * 60 * 1000;

export type Groupable = { member_id: string; created_at: string };

function withinGap(a: Groupable, b: Groupable): boolean {
  const gap = Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return Number.isFinite(gap) && gap < GROUP_GAP_MS;
}

/** True when this message opens a run: show the face and the name. */
export function startsGroup(previous: Groupable | undefined, message: Groupable): boolean {
  if (!previous) return true;
  if (previous.member_id !== message.member_id) return true;
  return !withinGap(previous, message);
}

/** True when this message closes a run: give the bubble its tail. */
export function endsGroup(message: Groupable, next: Groupable | undefined): boolean {
  if (!next) return true;
  if (next.member_id !== message.member_id) return true;
  return !withinGap(message, next);
}
