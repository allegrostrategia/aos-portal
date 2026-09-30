import { requireReportUser } from "@/lib/auth/report";

/**
 * The reporting shell.
 *
 * Deliberately NOT inside the (portal) route group: that layout calls
 * requireMember(), which redirects anyone without a `members` row to
 * /no-access — and retainer clients, Chiarezza attendees and Elize have no
 * members row on purpose (Nina, 30 September 2026). This is their gate.
 *
 * Stage 2 builds the real shell: the page header and the horizontal category
 * tab row from brief §3. Still open, and worth deciding before then: an aOS
 * member reaching /reporting is also a portal member, so their version of
 * this screen probably wants the portal navigation around it, while a
 * retainer client's must not have it.
 */
export default async function ReportingLayout({ children }: LayoutProps<"/reporting">) {
  await requireReportUser();

  return <div className="flex min-h-svh flex-col bg-cream">{children}</div>;
}
