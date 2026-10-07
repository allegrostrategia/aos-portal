/**
 * What to say when somebody tries to delete an offer that has figures.
 *
 * Decision 4, 7 October 2026: `report_values.entity_id` and
 * `report_targets.entity_id` became `on delete restrict`, because deleting
 * one offer used to delete every figure ever recorded against it — on
 * published months included, which is rule 7 inverted.
 *
 * Nothing in the app deletes an entity today; "Retire this campaign" sets
 * `active = false` and is the whole story. This exists so that if a delete
 * is ever added, the refusal it meets has a sentence ready that says what
 * to do instead, rather than showing somebody a foreign key constraint.
 *
 * **Matched on the error code, not the message.** Postgres's wording for
 * 23503 names the constraint and the table and has changed between major
 * versions; a `.includes("violates RESTRICT")` here would quietly stop
 * matching one upgrade from now, and the person would be back to reading
 * the raw error.
 */

/** Postgres `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = "23503";

export function deleteEntityMessage(
  error: { code?: string | null; message?: string | null },
  what: "offer" | "campaign" | "funnel",
): string | null {
  if (error.code !== FOREIGN_KEY_VIOLATION) return null;

  // Dom's wording, 7 October, correcting mine. The first draft said "months
  // that have already gone out", which is wrong twice over: `restrict`
  // fires on ANY referencing row, so a draft month's figures block the
  // delete exactly as a published one's do, and it is on campaigns and
  // funnels as much as offers.
  return (
    `This ${what} has figures saved against it, so deleting it would take ` +
    `them off its reports. Use “Retire this ${what}” instead. It comes off ` +
    `the entry screens and the history stays.`
  );
}
