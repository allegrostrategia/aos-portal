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

/**
 * Paths a login can use whatever door it has.
 *
 * /set-password is the one that matters: an invited account has no members
 * row and no reporting grant until somebody gives it one, and setting a
 * password is exactly what it is here to do.
 */
const ANY_LOGIN_PATHS = ["/set-password"];

/** `/reporting` and `/reporting/anything`, but never `/reportingfoo`. */
function inArea(path: string, area: string): boolean {
  return path === area || path.startsWith(`${area}/`);
}

/**
 * Whether a post-login `?next=` is somewhere THIS login can actually use,
 * and "/" when it is not.
 *
 * `safeNextPath` only asks whether a path is internal. That is not enough:
 * the proxy sets `next` to whatever page was asked for while signed out, so
 * a reporting client who left a tab open on a members-only screen came back
 * with `?next=/no-access` in the login URL and was sent obediently to "Your
 * account isn't ready yet" — with a perfectly good report one URL away.
 * Found by Dom on 5 October, signed in as a real retainer client.
 *
 * `landing` is where this login would go of its own accord, so it carries
 * the only fact needed here: which door they have. "/" is the answer for
 * anything they cannot use, because "/" asks `landingPath` and gets it right.
 */
export function usableNextPath(next: unknown, landing: Landing): string {
  const path = safeNextPath(next);
  const pathname = path.split(/[?#]/)[0];

  if (pathname === "/") return "/";

  // /no-access and /login explain a lack of somewhere to be. Aiming at one
  // is never what anybody wanted: whoever has a door should go through it,
  // and whoever has none is sent to these by the root page anyway.
  if (inArea(pathname, "/no-access")) return "/";
  if (inArea(pathname, "/login") || inArea(pathname, "/forgot-password")) return "/";

  if (ANY_LOGIN_PATHS.some((allowed) => inArea(pathname, allowed))) return path;

  // A member may go anywhere they asked for, reporting included — for them
  // it is one more area of the membership.
  if (landing === "/piazza") return path;

  // A reporting login has exactly one area. Every other path in the app is
  // behind a members row they do not have, so honouring it would land them
  // on /no-access, which is the bug.
  if (landing === "/reporting") return inArea(pathname, "/reporting") ? path : "/";

  return "/";
}
