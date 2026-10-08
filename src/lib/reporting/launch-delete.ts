/**
 * What to say when a stage or a price option still has figures on it.
 *
 * `report_launch_values.stage_id` and `.price_id` became
 * `on delete restrict` on 8 October: removing a stage used to take its
 * sign-ups, its attendance and its whole email sequence with it, silently,
 * because a foreign key cascade does not consult RLS or fire a policy.
 * That is reachable on a launch the client has read, since a correction
 * goes unpublish → fix → republish.
 *
 * **Matched on the error code, not the message** — Postgres's wording for
 * 23503 names the constraint and has changed between major versions, so a
 * message match would stop working one upgrade from now, silently. The
 * same reasoning as `deleteEntityMessage`.
 */

/**
 * The two SQLSTATEs a blocked delete can raise.
 *
 * **`ON DELETE RESTRICT` raises 23001, not 23503.** Postgres keeps
 * `restrict_violation` separate from `foreign_key_violation`, and the
 * first version of this checked only the second — so the sentence below
 * would never have appeared and the editor would have read a constraint
 * name instead. Found on 8 October by a test that used a REAL refusal
 * rather than a hand-made error object, which is the only reason it was
 * found at all.
 */
const BLOCKED_BY_A_REFERENCE = new Set(["23001", "23503"]);

export function launchDeleteMessage(
  error: { code?: string | null; message?: string | null },
  what: "stage" | "price option",
  name: string,
): string | null {
  if (!error.code || !BLOCKED_BY_A_REFERENCE.has(error.code)) return null;

  return (
    `“${name}” has figures saved against it, so removing it would take ` +
    `them off its report. Clear the figures first, then remove the ${what}.`
  );
}
