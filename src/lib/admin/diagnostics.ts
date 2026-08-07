import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type ReadinessCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

/**
 * Can this deployment actually send an invitation?
 *
 * Invitations fail in a way that's hard to distinguish from the outside — a
 * missing service role key and a rejected one produce much the same shrug — and
 * on Vercel an environment variable only takes effect on the NEXT build, so
 * "I added it" and "it's live" are different facts. This answers both, on demand,
 * without anyone guessing.
 *
 * Admin-only, and it never returns a key value — only whether one works.
 */
export async function checkInviteReadiness(): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];

  const siteUrl = env.siteUrl;
  checks.push({
    label: "Site URL",
    ok: Boolean(siteUrl && !siteUrl.includes("localhost")),
    detail: siteUrl
      ? siteUrl.includes("localhost")
        ? `Set to ${siteUrl} — invitation emails would link to a machine only you can reach.`
        : siteUrl
      : "NEXT_PUBLIC_SITE_URL isn't set, so invitation links would point nowhere.",
  });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    checks.push({
      label: "Service role key",
      ok: false,
      detail:
        "Not set on this deployment. If you've just added it in Vercel, redeploy — environment variables only apply to builds made after they're saved.",
    });
    return checks;
  }

  // Cheapest possible call that proves the key is both present and accepted.
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });

    checks.push({
      label: "Service role key",
      ok: !error,
      detail: error
        ? `Set, but Supabase rejected it: ${error.message}`
        : "Working — invitations can be sent.",
    });
  } catch (cause) {
    checks.push({
      label: "Service role key",
      ok: false,
      detail: `Set, but the call failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    });
  }

  return checks;
}
