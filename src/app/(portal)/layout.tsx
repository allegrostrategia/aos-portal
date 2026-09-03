import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { signOut } from "@/lib/auth/actions";
import {
  PortalNavBottom,
  PortalNavSidebar,
  type NavItem,
} from "@/components/portal-nav";
import { FloatingTimer } from "@/components/timer/floating-timer";
import { getRunningEntry, getTimeCategories } from "@/lib/timer/queries";

/**
 * The authenticated shell.
 *
 * The real access decision happens here, once — the proxy's check is optimistic
 * (cookie only, no database round trip on every prefetch), which makes it a
 * filter rather than the gate.
 */
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();

  // Time tracking is open from day one, onboarding included (§1), so the timer
  // is part of the shell rather than something that appears later.
  const [categories, running] = await Promise.all([
    getTimeCategories(),
    getRunningEntry(member.id),
  ]);

  // Only destinations that exist. Piazza Sociale and Archivio join as they're
  // built — a nav item that 404s is worse than one that isn't there yet.
  const items: NavItem[] = [
    { href: "/piazza", label: "Piazza" },
    // Onboarding members get the sequence up front; it drops out of the nav once
    // they're active and there's nothing left to do there.
    ...(member.status === "onboarding"
      ? [{ href: "/onboarding", label: "First weeks" }]
      : []),
    { href: "/log", label: "Your log" },
    // Visible to onboarding members too — §1 keeps the session itself in view so
    // the quiet weeks show what's coming; only submitting is gated.
    { href: "/hot-seat", label: "Hot seat" },
    { href: "/stations", label: "La Strada" },
    { href: "/sociale", label: "Sociale" },
    { href: "/pairing", label: "Pairing" },
    ...(member.role === "admin"
      ? [
          { href: "/admin/members", label: "Admin" },
          { href: "/admin/hot-seat", label: "Sessions" },
          { href: "/admin/touchpoint", label: "Friday" },
          { href: "/admin/reminders", label: "Emails" },
          { href: "/admin/library", label: "Library" },
          { href: "/admin/draw", label: "Draw" },
          { href: "/admin/pairing", label: "Pairs" },
        ]
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

      <FloatingTimer categories={categories} running={running} />
      <PortalNavBottom items={items} />
    </div>
  );
}
