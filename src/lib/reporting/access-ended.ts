import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Why a reporting login stopped, which decides how the page says it.
 *
 * `expired` is a Chiarezza window reaching the date it was always going to
 * reach; `revoked` is Nina ending a retainer client's access on a day nobody
 * knew in advance. "Ran until" is right for the first and slightly wrong for
 * the second — it implies a term that was planned — so they get their own
 * sentence. Dom, 30 October.
 */
export type AccessEndedReason = "expired" | "revoked";

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
export async function reportAccessEnded(): Promise<{
  endedOn: string;
  reason: AccessEndedReason;
} | null> {
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
  const stopped = rows.map((row): { on: string; reason: AccessEndedReason } | null => {
    if (row.revoked_at) return { on: row.revoked_at.slice(0, 10), reason: "revoked" };
    const end = row.report_workspaces?.access_end_date ?? null;
    return end !== null && end < today ? { on: end, reason: "expired" } : null;
  });

  // Any grant still live means access did not end — something else is going
  // on, and saying "your access has ended" would be wrong.
  if (stopped.some((stop) => stop === null)) return null;

  // The most recent stop is the one to name: it is the day they actually
  // lost the last of it, and its own reason is the true one for that day.
  // A login with both kinds is not a shape anybody has today — it would take
  // one person holding a Chiarezza place and a retainer — but picking the
  // latest means the answer stays right if it ever happens.
  const [latest] = (stopped as { on: string; reason: AccessEndedReason }[]).sort(
    (a, b) => b.on.localeCompare(a.on),
  );

  return { endedOn: latest.on, reason: latest.reason };
}
