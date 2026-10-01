import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/member";
import { getReportUser } from "@/lib/auth/report";
import { landingPath } from "@/lib/auth/landing";

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
  const [member, reportUser] = await Promise.all([
    getCurrentMember(),
    getReportUser(),
  ]);

  // A session is what separates "nothing here for you" from "please sign in",
  // and getCurrentMember() returns null for both.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(
    landingPath({
      memberStatus: member?.status ?? null,
      hasReportAccess: reportUser !== null,
      signedIn: user !== null,
    }),
  );
}
