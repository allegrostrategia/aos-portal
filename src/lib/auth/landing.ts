/**
 * Which door a login goes through.
 *
 * Since 30 September 2026 aOS has two kinds of account — members, and the
 * reporting logins that have no `members` row at all — so "where do I send
 * this person" stopped being a constant and became a decision.
 *
 * It is here, once, because it was briefly in three places. The proxy and
 * the root page were both updated when reporting logins arrived; the sign-in
 * action was not, and still sent everybody to /piazza. A retainer client
 * signing in for the first time landed on "Your account isn't ready yet" —
 * found on 1 October by signing in as one and looking.
 *
 * Everything that needs a destination now points at "/" and lets the root
 * page call this once, rather than each caller working it out again.
 */

export type Landing = "/piazza" | "/reporting" | "/no-access" | "/login";

export interface LandingInput {
  /** Their `members` row status, or null when they have none. */
  memberStatus: "onboarding" | "active" | "cancelled" | null;
  /** Whether they hold any reporting grant, or are an admin. */
  hasReportAccess: boolean;
  /** Whether there is a session at all. */
  signedIn: boolean;
}

export function landingPath({
  memberStatus,
  hasReportAccess,
  signedIn,
}: LandingInput): Landing {
  if (!signedIn) return "/login";

  // A member goes to the portal whether or not they also have reporting —
  // for them it is one more area of the membership, reached from inside.
  if (memberStatus && memberStatus !== "cancelled") return "/piazza";

  // No membership, or a cancelled one. Reporting is the only other door.
  if (hasReportAccess) return "/reporting";

  // Cancelled, or an invited account whose member record does not exist yet.
  return "/no-access";
}

/**
 * A post-login `?next=` is only honoured when it is an internal path, so a
 * crafted value cannot turn the login form into an open redirect. The
 * fallback is "/" rather than any real screen, because "/" is the only place
 * that knows which door this person has.
 */
export function safeNextPath(value: unknown): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path.startsWith("/")) return "/";
  // Protocol-relative, and the backslash form some parsers normalise to it.
  if (path.startsWith("//") || path.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(path)) return "/";
  return path;
}
