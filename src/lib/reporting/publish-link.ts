/**
 * Where the publish email's link points.
 *
 * **The configured site address and nothing else — never the request's
 * origin.** This is the invitation bug written down as a rule, and it is
 * worth a module of its own because it has already cost an evening: an
 * invitation built its link from whatever address the request arrived on, so
 * one sent from a developer's machine carried a link to `localhost`. It
 * worked perfectly for whoever sent it and was dead for everyone else.
 * Testing it yourself is exactly what hides it. Approved in the §8 plan,
 * 5 October 2026.
 *
 * Pure: no `headers()`, no database, no clock. It takes the address and
 * answers; `publishEmailLink` is the only thing that reads the environment,
 * and it reads the *site* setting, which a request cannot influence.
 */

/** Addresses that only resolve on the machine that sent the email. */
const LOCAL =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]*\.local)(:\d+)?$/i;

export type LinkResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * The link to a month's report, or a refusal naming what would have gone out.
 *
 * Refusing is the whole point. Sending a notification whose link nobody can
 * open is worse than not sending it: the client has been told their report is
 * ready and handed a dead end, and the only person who can tell is the one
 * who cannot reproduce it.
 */
export function reportLinkFor(
  siteUrl: string | null | undefined,
  { workspaceId, month }: { workspaceId: string; month: string },
): LinkResult {
  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");

  if (!base) {
    return {
      ok: false,
      error:
        "NEXT_PUBLIC_SITE_URL isn't set on this deployment, so the email's link would point nowhere. The month is published; nothing was sent.",
    };
  }

  if (LOCAL.test(base)) {
    return {
      ok: false,
      error:
        `NEXT_PUBLIC_SITE_URL is ${base}, which only works on this machine. ` +
        "The month is published; no email was sent, because the client could not have opened the link.",
    };
  }

  // The month as the report's own URLs carry it: 2026-08, not 2026-08-01.
  const params = new URLSearchParams({
    workspace: workspaceId,
    month: month.slice(0, 7),
  });

  return { ok: true, url: `${base}/reporting?${params.toString()}` };
}
