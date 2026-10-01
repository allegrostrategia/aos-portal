/**
 * Who may do what to a workspace — the code half of the rule.
 *
 * §13 asks for security in both RLS and code, never RLS alone. The database
 * holds the same rule independently in `report_can_edit()`; this is what the
 * screens and the server actions consult, so a refusal can say something
 * useful instead of surfacing a policy violation.
 *
 * It lives here because it had been written out four times — in the page
 * context, the figures action, the notes action and the offers action — and
 * a rule copied four times is a rule that will eventually disagree with
 * itself. Pure, so it can be tested without a database.
 */

export type WorkspaceKind = "retainer" | "aos_member" | "chiarezza";
export type GrantRole = "client" | "team";

export interface AccessInput {
  /** Their grant on this workspace, or null if they hold none. */
  role: GrantRole | null;
  kind: WorkspaceKind;
  /** Nina. Admins reach every workspace without a grant of their own. */
  isAdmin: boolean;
}

/** Can they open it at all? */
export function canView({ role, isAdmin }: AccessInput): boolean {
  return isAdmin || role !== null;
}

/**
 * Can they change the figures?
 *
 * §2's role table: a retainer client views and comments, never edits —
 * Allegro enters their data. A self-serve client (aOS member, Chiarezza)
 * enters their own. A team assignment always edits. An admin edits anything.
 */
export function canEdit({ role, kind, isAdmin }: AccessInput): boolean {
  if (isAdmin) return true;
  if (role === "team") return true;
  return role === "client" && kind !== "retainer";
}

/**
 * Can they write the strategist note?
 *
 * Team or admin only. For an aOS member the equivalent is their own
 * reflection, which is a different note type — a member filing a "note from
 * your strategist" about themselves is not a thing the product has.
 */
export function canWriteStrategistNote({ role, isAdmin }: AccessInput): boolean {
  return isAdmin || role === "team";
}

/** Publishing is Nina's alone — her decision, 30 September 2026. */
export function canPublish({ isAdmin }: AccessInput): boolean {
  return isAdmin;
}
