/**
 * Where an invitation link points, and when that is a mistake.
 *
 * An invitation is built from the request's origin. Sent from a dev server
 * that means `http://localhost:3000` — a link that works perfectly for the
 * person who sent it, on their own machine, and is dead for everybody else.
 * Which makes it the worst kind of bug: testing it yourself is what hides it.
 *
 * `checkInviteReadiness` has warned about this on /admin/members since
 * September, but a warning on another screen is not a guard. This refuses.
 */

/** Origins that only resolve on the machine that sent the invitation. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]*\.local)(:\d+)?$/i;

export function isSendableOrigin(origin: string | null | undefined): boolean {
  // Trim FIRST: "   " is a truthy string, and testing it against the pattern
  // below matches nothing, which would have let a blank origin through as
  // sendable.
  const cleaned = (origin ?? "").trim().replace(/\/$/, "");
  if (!cleaned) return false;
  return !LOCAL.test(cleaned);
}

/**
 * The message to show instead of sending. Names the address, because the
 * person reading it is about to email a client and needs to know what
 * would have happened rather than that something "failed".
 */
export function localOriginRefusal(origin: string): string {
  return (
    `That would email a link to ${origin}, which only works on this machine. ` +
    `Send invitations from the live site (aos.allegrostrategia.com), not from a local dev server.`
  );
}
