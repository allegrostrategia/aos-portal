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
  return error.message.includes("That month is published") ? LOCKED_MESSAGE : null;
}
