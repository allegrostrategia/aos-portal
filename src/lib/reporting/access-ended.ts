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
    .select("workspace_id, revoked_at, report_workspaces!inner(access_end_date)")
    .eq("user_id", userId)
    .eq("role", "client");

  const rows = (data ?? []) as unknown as {
    revoked_at: string | null;
    report_workspaces: { access_end_date: string | null } | null;
  }[];
  if (rows.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  // **Two ways a reporting login stops, and this page is the only thing a
  // person sees for either.** A Chiarezza window runs out on its own; a
  // retainer client's grant is ended by Nina (`end_report_client_access`,
  // 29 October). The second was added after the first and reached this
  // function with nothing to say about it, so an ended retainer client would
  // have read "your account isn't ready yet" — an invitation to email about
  // something that is working as intended, which is the exact failure this
  // function was written for.
  const stopped = rows.map((row) => {
    if (row.revoked_at) return row.revoked_at.slice(0, 10);
    const end = row.report_workspaces?.access_end_date ?? null;
    return end !== null && end < today ? end : null;
  });

  // Any grant still live means access did not end — something else is going
  // on, and saying "your access has ended" would be wrong.
  if (stopped.some((d) => d === null)) return null;

  return { endedOn: (stopped as string[]).sort().at(-1)! };
}
