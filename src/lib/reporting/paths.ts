/**
 * Where a save is allowed to send someone next.
 *
 * "Save & next section" carries its destination in the form body, so the
 * value is whatever the sender put there. Redirecting to an unchecked string
 * is an open redirect, and the case that catches people out is not
 * `https://evil.example` — it is `//evil.example`, a protocol-relative URL
 * that a naive `startsWith("/")` check waves straight through.
 *
 * Its own module because `actions.ts` is a "use server" file, where every
 * export has to be an async server action. A security check deserves a unit
 * test more than it deserves to be private.
 */
export function isInternalReportPath(path: string): boolean {
  if (!path.startsWith("/reporting")) return false;
  // Protocol-relative, and the backslash form some parsers normalise to it.
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  // A colon before the first slash would be a scheme; there is none here,
  // but a control character can smuggle one past a browser's URL parser.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return true;
}
