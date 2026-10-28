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
 * so they are told whether it worked. And there is nowhere to record the
 * outcome, because a launch has no equivalent of `report_periods`'
 * email columns — which is fine while the result goes straight back to
 * the person who asked, and is the first thing to add if this ever moves
 * out of band.
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

  return { ok: true };
}
