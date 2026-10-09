import "server-only";

import { createClient } from "@/lib/supabase/server";
import { STAGE_5 } from "./categories.ts";
import { latestReportableMonth } from "./months.ts";
import { monthIsFinished } from "./completion-input.ts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The reporting workspace a member reports on themselves in, or null.
 *
 * **Why a query of its own, rather than `resolveReportContext`.** That
 * one redirects to `/no-access` when it finds nothing, which is right
 * for the reporting screens and quite wrong for a link on `You`: asking
 * "do you have a report?" should not be able to navigate anybody
 * anywhere.
 *
 * Scoped to `aos_member` deliberately. A retainer client has a workspace
 * too, and `You` is a member's page — a retainer login has no `members`
 * row and never reaches it. Narrowing here means this cannot start
 * showing a Chiarezza workspace the day one is created for somebody who
 * is also a member.
 *
 * RLS answers it, so a member only ever finds their own.
 */
export async function getMyReportingWorkspace(): Promise<
  { id: string; business_name: string } | null
> {
  // Nothing offers a member their report until Stage 5 is on. The link
  // would otherwise sit on You, in front of somebody whose report has
  // no settings screen and no reflection to write.
  if (!STAGE_5) return null;

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return null;

  // **Owned, not merely readable.** Scoping on `kind` alone asked "an
  // aOS member workspace this login can see", and an admin can see
  // every one of them — so Nina was shown somebody else's unfinished
  // report on her own Piazza. Found by a test that checked she was not.
  const { data } = await supabase
    .from("report_workspaces")
    .select("id, business_name")
    .eq("kind", "aos_member")
    .eq("owner_user_id", userId)
    .order("created_at")
    .limit(1)
    .returns<{ id: string; business_name: string }[]>();

  return data?.[0] ?? null;
}

/**
 * Last month, if the member has not finished reporting on it.
 *
 * §8.1's nudge, and Nina's decision 25. **Private by construction**: it
 * is derived from this member's own workspace on their own page render,
 * so there is no feed, no row anybody else can read, and nothing for
 * another member to see. Dom asked for that explicitly, and the way to
 * guarantee it is to have nothing to leak rather than to filter a list.
 *
 * Null when there is nothing to say — no workspace, Stage 5 off, or the
 * month is done. A card that appears every month regardless is one
 * people stop reading.
 */
export async function getUnfinishedReportMonth(): Promise<
  { workspaceId: string; month: string } | null
> {
  const workspace = await getMyReportingWorkspace();
  if (!workspace) return null;

  const month = latestReportableMonth(new Date().toISOString().slice(0, 10));
  // Their own workspace id, found through RLS above — the admin client
  // is only how the completion is read, not how the workspace is found.
  const done = await monthIsFinished(createAdminClient(), workspace.id, month);
  return done ? null : { workspaceId: workspace.id, month };
}
