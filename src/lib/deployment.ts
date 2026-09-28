/**
 * Which deployment is this, and should it say so?
 *
 * Written on 28 September, after an evening spent on an email that wasn't
 * failing: a recap was sent, the figures were stored and the read was
 * recorded — all against the live database — by a **preview** deployment,
 * which has no `RESEND_API_KEY`. Nothing was broken. We were simply not where
 * we thought we were.
 *
 * The installed home-screen app is what hid it. A web app manifest's
 * `start_url` is relative, so an icon added from a preview URL opens that
 * preview for ever, and the standalone window has no address bar to say so.
 * Exactly the shape of the earlier viewport bug: the phone was telling the
 * truth and nothing was showing it.
 *
 * So: a preview says it is a preview, on every screen. Pure functions here,
 * read from `process.env` at the edges, so the rule is testable without a
 * deployment.
 */

export type Deployment = "production" | "preview" | "development" | "local";

/**
 * `VERCEL_ENV` is set on every Vercel deployment and nowhere else, so its
 * absence means a machine — `npm run dev`, or the test harness.
 */
export function deploymentOf(vercelEnv: string | undefined): Deployment {
  switch (vercelEnv) {
    case "production":
      return "production";
    case "preview":
      return "preview";
    case "development":
      return "development";
    default:
      return "local";
  }
}

/**
 * Local development is deliberately quiet: the address bar already says
 * localhost, and a banner on every screen all day is a banner nobody reads by
 * Thursday. Anything deployed that isn't production earns one.
 */
export function shouldWarnAboutDeployment(deployment: Deployment): boolean {
  return deployment === "preview" || deployment === "development";
}

/** What the banner says. Short: it sits above every screen. */
export function deploymentLabel(deployment: Deployment, host: string | undefined): string {
  const where = host ? ` · ${host}` : "";
  return deployment === "preview"
    ? `Preview build — not the live app${where}`
    : `${deployment} build — not the live app${where}`;
}

/**
 * A deployment with no database is a mistake worth stopping at, not working
 * around. Locally it is the normal state before `.env.local` is filled in, so
 * only a real deployment refuses.
 */
export function shouldRefuseUnconfigured(
  deployment: Deployment,
  isSupabaseConfigured: boolean,
): boolean {
  return !isSupabaseConfigured && deployment !== "local";
}
