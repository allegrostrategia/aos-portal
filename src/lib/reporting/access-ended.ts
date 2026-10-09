import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Whether this login's reporting access has run out, and when.
 *
 * A Chiarezza attendee is given access with an end date. The day after
 * it passes, `report_can_view` stops admitting them, every workspace
 * disappears, and `resolveReportContext` sends them to `/no-access` —
 * which told them **"Your account isn't ready yet"** and invited them
 * to email, because they have no `members` row and the page had no
 * third case. An attendee whose course has finished is not somebody
 * whose account is still being set up.
 *
 * **Read with the service role on purpose**, and this is the case the
 * admin client exists for: the member's own session genuinely cannot do
 * it, because the policy that hides the workspace is the very thing
 * being reported on. Scoped to the signed-in user's own id, so it can
 * only ever answer about them.
 */
export async function reportAccessEnded(): Promise<{ endedOn: string } | null> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("report_access")
    .select("workspace_id, report_workspaces!inner(access_end_date)")
    .eq("user_id", userId)
    .eq("role", "client");

  const rows = (data ?? []) as unknown as {
    report_workspaces: { access_end_date: string | null } | null;
  }[];
  if (rows.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const ends = rows
    .map((r) => r.report_workspaces?.access_end_date ?? null)
    .filter((d): d is string => d !== null);

  // Any grant with no end date means access did not run out — something
  // else is going on, and saying "your access ended" would be wrong.
  if (ends.length !== rows.length) return null;

  const latest = ends.sort().at(-1)!;
  return latest < today ? { endedOn: latest } : null;
}
