import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/member";
import { getReportUser } from "@/lib/auth/report";

/**
 * aOS is members-only — there is no public marketing page here, that's
 * allegrostrategia.com. The root just points people at the right door.
 *
 * Since 30 September 2026 there are two doors. Retainer clients, Chiarezza
 * attendees and Elize hold a login with no `members` row (see
 * 20260930120000_report_workspaces_access.sql), and before this branch
 * existed they had no route through the app at all: the proxy sent a
 * signed-in user to /piazza, and the portal layout sent anyone without a
 * members row to /no-access. This is the one place that decides, so the
 * proxy can stay optimistic and do no database work.
 */
export default async function RootPage() {
  const member = await getCurrentMember();

  // A member goes to the portal, reporting or not — for them it is one more
  // area of the membership, reached from inside.
  if (member && member.status !== "cancelled") redirect("/piazza");

  const reportUser = await getReportUser();
  if (reportUser) redirect("/reporting");

  // Cancelled, or an invited account whose member record does not exist yet.
  if (member) redirect("/no-access");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/no-access" : "/login");
}
