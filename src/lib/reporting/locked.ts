import { todayInAppZone } from "../time-zone.ts";
import type { LaunchStage } from "./launch-queries.ts";
import type { ReportWorkspace } from "./queries.ts";

/**
 * Is this month closed to edits?
 *
 * The screen half of `report_month_is_locked()`, and deliberately the same
 * two conditions in the same order, because the two halves disagreeing is
 * the failure that matters: a form that submits into a refusal reads as the
 * app being broken, and a form that refuses where the database would not
 * reads as the app being wrong.
 *
 * Dom's decision, 7 October 2026. Corrections go unpublish -> fix ->
 * republish, and republishing emails the client to say it changed.
 *
 * **Not conditioned on who is looking.** An admin passes the database guard
 * — she is the only person who can unpublish, so locking her out would be a
 * trap — but her screens go read-only with everybody else's. The lock is a
 * route, not a permission: it says "this went out, take it back first".
 */
export function monthIsLocked(
  workspace: Pick<ReportWorkspace, "kind">,
  publishedAt: string | null | undefined,
): boolean {
  // Publishing is a retainer concept. A self-serve month is visible to its
  // owner from the moment they type it — "there is nobody to wait for" —
  // and they are their own editor, so a lock here would shut them out of
  // their own figures behind a button only an admin can press.
  if (workspace.kind !== "retainer") return false;
  return Boolean(publishedAt);
}

/**
 * Is this launch closed to edits?
 *
 * The screen half of `report_launch_is_locked()`, and the same two
 * conditions in the same order, for the reason `monthIsLocked` gives: a
 * form that submits into a refusal reads as the app being broken, and one
 * that refuses where the database would not reads as the app being wrong.
 *
 * **Not conditioned on who is looking**, again. An admin passes the
 * database guard because she is the only person who can unpublish, but
 * her screens go read-only with everybody else's.
 */
export function launchIsLocked(
  workspace: Pick<ReportWorkspace, "kind">,
  publishedAt: string | null | undefined,
  /** `launchLastDay(detail.stages)` — see it for why this is required. */
  lastDay: string | null,
  today: string = todayInAppZone(),
): boolean {
  // Publishing is a retainer concept. A self-serve member's launch is
  // visible to them from the moment they type it and they are their own
  // editor, so a lock here would shut them out of their own work.
  if (workspace.kind !== "retainer") return false;
  if (!publishedAt) return false;

  // **A published launch is a scoreboard before it is a report** (Nina,
  // 3 November: she updates a launch daily while it runs). Still
  // running, still editable; the day it ends is a day she is still
  // typing into it, so the comparison is strictly-after rather than
  // on-or-after. No dates at all locks on publish, which is the safe way
  // round: nothing says when it stops, and a report that silently never
  // locks is worse than one that locks early.
  if (lastDay === null) return true;
  return today > lastDay;
}

/**
 * The last day a launch is scheduled for, or null if nothing says.
 *
 * **A required argument to `launchIsLocked` rather than an optional
 * one**, because the failure it prevents is a caller that forgets: an
 * optional parameter would default a new screen back to the old rule
 * and lock a running launch, which is the bug this was built to remove
 * and would look exactly like it never shipped.
 *
 * The twin of `report_launch_last_day()`, and the same shape for the
 * same reason the two lock functions are the same shape — a screen that
 * disagrees with the database reads as the app being broken.
 */
export function launchLastDay(
  stages: Pick<LaunchStage, "promo_start" | "promo_end" | "live_start" | "live_end">[],
): string | null {
  const dates = stages
    .flatMap((s) => [s.promo_start, s.promo_end, s.live_start, s.live_end])
    .filter((d): d is string => Boolean(d));
  // ISO dates sort as strings, which is the whole reason they are stored
  // as text up here: no Date object is built, so no zone can shift one.
  return dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

/**
 * Is this launch still running — published, and not yet past its dates?
 *
 * What the client's report says out loud: "Running totals, live until 12
 * October". A published report is read as final unless it says
 * otherwise, and this is the sentence that buys the editability above.
 *
 * Deliberately not `!launchIsLocked(...)`: a draft is not locked either,
 * and a draft is not running.
 */
export function launchIsRunning(
  workspace: Pick<ReportWorkspace, "kind">,
  publishedAt: string | null | undefined,
  lastDay: string | null,
  today: string = todayInAppZone(),
): boolean {
  if (workspace.kind !== "retainer") return false;
  if (!publishedAt) return false;
  return lastDay !== null && today <= lastDay;
}

/** What the database says when a launch guard refuses. */
export const LAUNCH_LOCKED_MESSAGE =
  "That launch report is published. Unpublish it to make changes.";

/** Hand a launch guard's refusal back plainly, or nothing. */
export function launchLockedError(error: { message: string }): string | null {
  return error.message.includes("That launch report is published")
    ? LAUNCH_LOCKED_MESSAGE
    : null;
}

/**
 * What the database says when the guard refuses, in its own words.
 *
 * Kept here beside `monthIsLocked` so the string appears twice in the
 * codebase and not more: once in the migration, once here.
 */
export const LOCKED_MESSAGE = "That month is published. Unpublish it to make changes.";

/**
 * Hand the guard's refusal back plainly, or nothing.
 *
 * Nobody should meet this — every screen that can hit it is read-only
 * first. It is for the cases a screen cannot cover: a form left open in
 * another tab while the month was published, or a stale page submitted
 * from a phone that has been asleep. "Couldn't save: That month is
 * published…" reads as a fault; the sentence on its own reads as the
 * answer, and names the way out.
 */
export function lockedError(error: { message: string }): string | null {
  if (error.message.includes("That month is published")) return LOCKED_MESSAGE;
  // The launch guard says almost the same thing about a different kind of
  // report, and every action that already asks this question should get
  // the sentence rather than the raw refusal.
  if (error.message.includes("That launch report is published")) {
    return LAUNCH_LOCKED_MESSAGE;
  }
  return null;
}
