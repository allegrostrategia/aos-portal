/**
 * What, if anything, to offer somebody about installing aOS.
 *
 * Pure, so the branch that decides whether an iPhone member ever sees the
 * instructions can be tested — the rest of this feature is service-worker and
 * browser behaviour that no test here can reach, which makes the part that *is*
 * testable worth isolating properly.
 */

export type InstallState =
  /** Already on the home screen — nothing to say. */
  | "installed"
  /** The browser will do it for us: show a button that calls prompt(). */
  | "prompt"
  /** iOS: no install API exists, so the only option is telling them how. */
  | "ios-guide"
  /** A desktop browser, or one that can't install. Say nothing. */
  | "none";

export function installState(input: {
  userAgent: string;
  /** display-mode: standalone, or Safari's non-standard navigator.standalone. */
  isStandalone: boolean;
  /** Whether a beforeinstallprompt event has been captured. */
  canPrompt: boolean;
  dismissed: boolean;
}): InstallState {
  if (input.isStandalone) return "installed";
  if (input.dismissed) return "none";
  if (input.canPrompt) return "prompt";
  return isIos(input.userAgent) ? "ios-guide" : "none";
}

/**
 * iPadOS 13+ reports itself as a Mac, so the user-agent alone can't tell an iPad
 * from a desktop. A Macintosh claiming multiple touch points is the accepted
 * way to tell them apart — imperfect, and the cost of getting it wrong is one
 * dismissible card on a machine that can't act on it, not a broken page.
 */
export function isIos(userAgent: string): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;

  const maxTouchPoints =
    typeof navigator === "undefined" ? 0 : (navigator.maxTouchPoints ?? 0);
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
