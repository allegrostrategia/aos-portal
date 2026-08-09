import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { signOut } from "@/lib/auth/actions";
import {
  PortalNavBottom,
  PortalNavSidebar,
  type NavItem,
} from "@/components/portal-nav";

/**
 * The authenticated shell.
 *
 * The real access decision happens here, once — the proxy's check is optimistic
 * (cookie only, no database round trip on every prefetch), which makes it a
 * filter rather than the gate.
 */
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();

  // Only destinations that exist. Piazza Sociale and Archivio join as they're
  // built — a nav item that 404s is worse than one that isn't there yet.
  const items: NavItem[] = [
    { href: "/piazza", label: "Piazza" },
    { href: "/stations", label: "La Strada" },
    ...(member.role === "admin"
      ? [{ href: "/admin/members", label: "Admin" }]
      : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-navy/10 bg-white/50">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/piazza" className="font-display text-heading text-navy italic">
            aOS
          </Link>

          <div className="flex items-center gap-4">
            <span className="hidden text-small text-navy/70 sm:inline">
              {member.full_name}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-5">
        <aside className="hidden w-44 shrink-0 py-8 lg:block">
          <PortalNavSidebar items={items} className="sticky top-8" />
        </aside>

        {/* Bottom padding clears the mobile nav bar, which is fixed. */}
        <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
          {children}
        </div>
      </div>

      <PortalNavBottom items={items} />
    </div>
  );
}
