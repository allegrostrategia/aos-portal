import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/jobs/copy";
import { env } from "@/lib/env";
import { PUBLISH_EMAIL } from "./publish-email.ts";
import { reportLinkFor } from "./publish-link.ts";

/**
 * Telling the client their month is ready.
 *
 * Runs out of band, after the publish action has already answered. Two
 * consequences shape everything here:
 *
 *   · **The service role, not the admin's session.** Their request is over by
 *     the time this runs, and a retainer client's address lives in
 *     `auth.users`, which nothing reads without it. Reaching for
 *     `createClient()` here would also call `cookies()` outside a request,
 *     which Next forbids — the bug that stopped the recap's read tracking
 *     for a fortnight.
 *   · **Every exit is recorded.** A failure has nowhere to surface once the
 *     page has said "published", so the outcome is written onto the period,
 *     where Nina is already looking. "No email arrived" and "we decided not
 *     to send" are indistinguishable from the outside, so neither is allowed
 *     to pass in silence. This is exactly how the recap's email failed
 *     quietly for an evening on 23 September.
 *
 * The month stays published whatever happens below. The report being
 * readable must not depend on an email provider.
 */

export type PublishSendResult = { ok: boolean; error?: string };

export async function sendPublishEmail(
  workspaceId: string,
  month: string,
  { update }: { update: boolean },
): Promise<PublishSendResult> {
  const admin = createAdminClient();

  const record = async (fields: {
    email_sent_at?: string | null;
    email_error: string | null;
    email_to?: string | null;
  }) => {
    const { error } = await admin
      .from("report_periods")
      .update({ email_sent_at: null, ...fields })
      .eq("workspace_id", workspaceId)
      .eq("month", month);

    // The service-role write must check its own error. A guard trigger that
    // admitted only `is_portal_admin()` would refuse this role silently, and
    // the day-7 pairing flag went unset in production for three weeks that
    // way. The guard here admits a null uid on purpose; this is the check
    // that would say so if it ever stopped.
    if (error) {
      console.error("[reporting] couldn't record the email outcome", workspaceId, month, error.message);
    }
  };

  const fail = async (error: string, to?: string | null): Promise<PublishSendResult> => {
    await record({ email_error: error, email_to: to ?? null });
    return { ok: false, error };
  };

  const { data: workspace } = await admin
    .from("report_workspaces")
    .select("business_name")
    .eq("id", workspaceId)
    .maybeSingle<{ business_name: string }>();

  if (!workspace) {
    return fail("Couldn't read the client this report belongs to, so nothing was sent.");
  }

  // The client contact, and only them: Nina's decision of 5 October — "the
  // one login holding the client grant on that business". A team member
  // assigned to the workspace is not a recipient; they publish it.
  const { data: grants } = await admin
    .from("report_access")
    .select("user_id, display_name")
    .eq("workspace_id", workspaceId)
    .eq("role", "client")
    .order("created_at")
    .order("id")
    .returns<{ user_id: string; display_name: string }[]>();

  const contact = grants?.[0];
  if (!contact) {
    return fail(
      "This client has no client login yet, so there was nobody to email. The month is published; add their login and send again.",
    );
  }

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(
    contact.user_id,
  );
  const to = account?.user?.email ?? null;

  if (accountError || !to) {
    return fail(
      `Couldn't read the email address for ${contact.display_name}'s login${accountError ? `: ${accountError.message}` : ""}.`,
    );
  }

  // The configured site address, never the request's — see publish-link.ts.
  // This is the only place the environment is read, and it is read after the
  // recipient is known so a refusal still records who it would have gone to.
  const link = reportLinkFor(env.siteUrl, { workspaceId, month });
  if (!link.ok) {
    return fail(link.error, to);
  }

  const copy = (update ? PUBLISH_EMAIL.update : PUBLISH_EMAIL.first)({
    name: contact.display_name,
    businessName: workspace.business_name,
    month,
    url: link.url,
  });

  const result = await sendEmail({
    to,
    subject: copy.subject,
    text: renderEmail(copy),
  });

  if (!result.ok) {
    console.error("[reporting] publish email failed", workspaceId, month, result.error);
    return fail(result.error ?? "The sender gave no reason.", to);
  }

  await record({
    email_sent_at: new Date().toISOString(),
    email_error: null,
    email_to: to,
  });
  return { ok: true };
}
