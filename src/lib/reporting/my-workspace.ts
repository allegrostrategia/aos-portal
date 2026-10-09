import "server-only";

import { createClient } from "@/lib/supabase/server";
import { STAGE_5 } from "./categories.ts";

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
  const { data } = await supabase
    .from("report_workspaces")
    .select("id, business_name")
    .eq("kind", "aos_member")
    .order("created_at")
    .limit(1)
    .returns<{ id: string; business_name: string }[]>();

  return data?.[0] ?? null;
}
