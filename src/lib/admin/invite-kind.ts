/**
 * What kind of account an invitation is for.
 *
 * **This is the one thing the invitation email knows about who it is
 * going to.** Supabase's "Invite user" template is a single template in
 * the dashboard — one body for every `inviteUserByEmail` call in this
 * codebase — and until 27 November it said the same thing to all of
 * them: *"Your aOS login is ready… everything you're going to come to
 * love over the next few months lives here."* True for a member. Wrong
 * for a retainer client, who is not joining a membership and has one
 * screen, and wrong for Elize, who works here.
 *
 * Supabase puts `user_metadata` in the template as `.Data`, so passing
 * this is what lets one template say three different things. The branches
 * live in `docs/reporting/invite-email-template.html`, which is the text
 * Dom pastes into the dashboard, and `invite-kind.test.ts` asserts that
 * every kind below has a branch there — the template is the one piece of
 * wording in this product that no deploy touches, so nothing else can
 * notice the two drifting apart.
 *
 * **The template's `else` is the member wording**, which is why a kind
 * that reached it by accident would be wrong rather than broken: an
 * invitation sent before this went in carries no `account_kind` at all
 * and still reads exactly as it did.
 */
export const ACCOUNT_KINDS = ["member", "retainer", "chiarezza", "team"] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/**
 * What goes in `inviteUserByEmail(email, { data })`.
 *
 * A function rather than a literal at each call site so the key is spelled
 * once: `{{ .Data.account_kind }}` in the template is matched on by name,
 * and a typo in one of three call sites would silently take that one
 * invitation to the `else` branch.
 */
export function inviteData(kind: AccountKind): { account_kind: AccountKind } {
  return { account_kind: kind };
}

/**
 * The account kind for a reporting workspace of each kind.
 *
 * `aos_member` is absent on purpose: a member's reporting workspace
 * attaches to the login they already have, so no invitation is ever sent
 * for one. `set_up_report_client` refuses that kind in the database for
 * the same reason.
 */
export function accountKindForWorkspace(kind: "retainer" | "chiarezza"): AccountKind {
  return kind;
}
