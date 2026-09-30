import type { Metadata } from "next";

import { requireReportUser, resolveWorkspace } from "@/lib/auth/report";

export const metadata: Metadata = {
  title: "Monthly Report — aOS",
};

/**
 * Stage 1 placeholder.
 *
 * It exists so the identity decision can actually be exercised: a login with
 * no `members` row now has somewhere to land, which is the thing that was
 * impossible before. The report itself is Stage 2 onwards (brief §11).
 *
 * §13: "Client users must never see a client switcher, admin areas, or any
 * sign other clients exist — remove from the page entirely, never hide with
 * CSS." So this names one workspace and nothing else. A team member or admin
 * with several gets a switcher in Stage 2; a client never does, because the
 * markup that would carry it is not rendered for them.
 */
export default async function ReportingPage() {
  const reportUser = await requireReportUser();
  const workspace = resolveWorkspace(reportUser);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-eyebrow text-orange uppercase tracking-widest">
        Allegro Strategia
      </p>
      <h1 className="font-display mt-3 text-title font-medium text-ink">
        Monthly Report
      </h1>
      {workspace ? (
        <p className="mt-4 text-body text-ink/80">
          {workspace.business_name} — your report is being set up. There is
          nothing to show yet.
        </p>
      ) : (
        <p className="mt-4 text-body text-ink/80">
          No client is set up on this login yet.
        </p>
      )}
    </main>
  );
}
