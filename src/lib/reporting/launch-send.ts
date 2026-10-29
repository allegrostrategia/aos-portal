import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/jobs/copy";
import { env } from "@/lib/env";
import { LAUNCH_EMAIL } from "./launch-email.ts";
import { launchLinkFor } from "./publish-link.ts";

/**
 * Telling the client their launch tracker has moved (decision 12).
 *
 * The same shape as `publish-send.ts`, deliberately: the service role,
 * because a retainer client's address lives in `auth.users` and nothing
 * reads it without one, and the client contact found the same way — the
 * oldest `report_access` row with role `client`, never a team member.
 *
 * Two differences, both because of how it is triggered. It is **awaited**,
 * not fired from `after()`: somebody pressed a button that does only this,
 * so they are told whether it worked — which is why only the success is
 * recorded, where a month records its failures too. A failure here has
 * somebody looking at it.
 *
 * The success goes onto `report_launches.update_email_sent_at`, so the
 * button can say when it last went and nobody sends twice in an
 * afternoon (Dom, 29 October).
 */

export type LaunchSendResult = { ok: boolean; error?: string };

export async function sendLaunchUpdateEmail(
  launchId: string,
): Promise<LaunchSendResult> {
  const admin = createAdminClient();

  const { data: launch } = await admin
    .from("report_launches")
    .select("id, name, workspace_id, published_at")
    .eq("id", launchId)
    .maybeSingle<{
      id: string;
      name: string;
      workspace_id: string;
      published_at: string | null;
    }>();

  if (!launch) {
    return { ok: false, error: "Couldn't read that launch, so nothing was sent." };
  }

  // Emailing a link to a launch the client cannot open is the one outcome
  // worse than not emailing at all — the same rule as resending a month.
  if (!launch.published_at) {
    return {
      ok: false,
      error: "That launch isn't published, so the client has nothing to look at yet.",
    };
  }

  const { data: workspace } = await admin
    .from("report_workspaces")
    .select("business_name, kind")
    .eq("id", launch.workspace_id)
    .maybeSingle<{ business_name: string; kind: string }>();

  if (!workspace) {
    return { ok: false, error: "Couldn't read the client this launch belongs to." };
  }

  // Retainer clients only, the same line decision 11 drew on the monthly
  // email. A member's own workspace carries a `client` grant — their
  // own — so without this they would be emailed about their own figures.
  if (workspace.kind !== "retainer") {
    return {
      ok: false,
      error: "This is a self-serve workspace, so there is no client to email about it.",
    };
  }

  const { data: grants } = await admin
    .from("report_access")
    .select("user_id, display_name")
    .eq("workspace_id", launch.workspace_id)
    .eq("role", "client")
    .order("created_at")
    .order("id")
    .returns<{ user_id: string; display_name: string }[]>();

  const contact = grants?.[0];
  if (!contact) {
    return {
      ok: false,
      error: "This client has no client login yet, so there was nobody to email.",
    };
  }

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(
    contact.user_id,
  );
  const to = account?.user?.email ?? null;

  if (accountError || !to) {
    return {
      ok: false,
      error: `Couldn't read the email address for ${contact.display_name}'s login${accountError ? `: ${accountError.message}` : ""}.`,
    };
  }

  const link = launchLinkFor(env.siteUrl, {
    workspaceId: launch.workspace_id,
    launchId: launch.id,
  });
  if (!link.ok) return { ok: false, error: link.error };

  const copy = LAUNCH_EMAIL.update({
    name: contact.display_name,
    businessName: workspace.business_name,
    launchName: launch.name,
    url: link.url,
  });

  const result = await sendEmail({ to, subject: copy.subject, text: renderEmail(copy) });

  if (!result.ok) {
    console.error("[reporting] launch update email failed", launchId, result.error);
    return { ok: false, error: result.error ?? "It didn't go, and gave no reason." };
  }

  // Recorded after the send, so a failure never reads as a send. The
  // service-role write checks its own error: a guard trigger that
  // refused this role would otherwise leave the button saying "never
  // sent" after every send, and nothing would say why. Both guards on
  // this table admit a null auth.uid(), and this is the check that would
  // notice if one stopped.
  const { error: recordError } = await admin
    .from("report_launches")
    .update({ update_email_sent_at: new Date().toISOString() })
    .eq("id", launchId);

  if (recordError) {
    console.error(
      "[reporting] the launch update went but was not recorded",
      launchId,
      recordError.message,
    );
  }

  return { ok: true };
}
