import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
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

  // Five, and always the same five (L'Editoriale). Hot seat, Milestones and
  // Pairing each have a card on Piazza instead of a slot here; the onboarding
  // sequence is a section at the top of Piazza rather than a nav item; the
  // Library is a toggle on La Strada. Admin routes live in the sidebar under
  // their own heading, and on the You screen on a phone.
  const items: NavItem[] = [
    { href: "/piazza", label: "Piazza", icon: "piazza" },
    { href: "/stations", label: "The Map", icon: "map" },
    { href: "/roadmap", label: "La Strada", icon: "strada" },
    { href: "/sociale", label: "Sociale", icon: "sociale" },
    { href: "/log", label: "Log", icon: "log" },
    { href: "/you", label: "You", icon: "you" },
  ];

  const admin: NavItem[] =
    member.role === "admin"
      ? [
          { href: "/admin/members", label: "Members" },
          { href: "/admin/hot-seat", label: "Hot seat" },
          { href: "/admin/touchpoint", label: "Friday" },
          { href: "/admin/reminders", label: "Emails" },
          { href: "/admin/library", label: "Library" },
          { href: "/roadmap?edit=1", label: "Roadmaps" },
          { href: "/admin/reveal", label: "Reveal" },
          { href: "/admin/draw", label: "Draw" },
          { href: "/admin/pairing", label: "Pairs" },
        ]
      : [];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Everything in this layout is chrome, and none of it belongs on paper.
          The SOP and the reveal document both print from inside the portal —
          they are admin and member screens, so they need the layout's auth —
          and without this the printed page carries the whole navigation with
          it. `print:hidden` on each piece rather than one wrapper, because the
          content sits between them in the DOM. */}
      {/* The mark, in the reference's orange: the home-screen icon's own
          letterforms, outlined, without the square (round 4, item 2). Sign-out
          moved to the You screen, where the reference keeps it; the header
          carries only the mark and, on desktop, who is signed in.

          Padded for the status bar. The viewport is `cover` and the status
          bar translucent, so on an iPhone the page runs under the clock; the
          inset keeps the mark below it (round 4, item 1). Inline, like the
          bottom bar's, so nothing in the class pipeline can drop it. */}
      <header className="print:hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pt-4 pb-1 sm:pt-5">
          <Link href="/piazza" className="block" aria-label="aOS. Piazza">
            {/* A plain img: the SVG is 2KB and a static file, and next/image
                would only add a request for the optimiser to say no. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/aos-mark.svg" alt="" className="h-6 w-auto sm:h-7" />
          </Link>

          <span className="hidden text-eyebrow font-medium uppercase text-ink/50 lg:inline">
            {member.full_name}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-5">
        <aside className="hidden w-44 shrink-0 py-8 lg:block print:hidden">
          <PortalNavSidebar items={items} admin={admin} className="sticky top-8" />
        </aside>

        {/* Bottom padding clears the mobile nav bar, which is fixed — and is
            removed for print, where there is no nav bar to clear. */}
        <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0 print:pb-0">
          {children}
        </div>
      </div>

      <div className="print:hidden">
        <FloatingTimer categories={categories} running={running} />
        <PortalNavBottom items={items} />
      </div>
    </div>
  );
}
