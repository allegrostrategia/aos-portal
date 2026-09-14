"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The portal's navigation, in two forms from one list.
 *
 * Desktop gets a persistent left sidebar; mobile gets a bottom bar. Neither is a
 * cut-down of the other, which is what standing rule 1 actually asks for. A
 * bottom bar also needs no JavaScript, no drawer and no focus trapping, so it
 * works everywhere rather than nearly everywhere.
 *
 * **Five items, since L'Editoriale (13 Sep 2026).** Eight was tried on a real
 * phone and rejected as cramped. Hot seat, Milestones and Pairing lost their
 * slots and each has a card on Piazza instead — a genuine route in, not an
 * implied one, because a screen with no reliable way in is invisible however
 * good it is once you're there. The Library lives on La Strada as a toggle.
 *
 * Admin destinations are not in the bar at all. They sit in the sidebar on
 * desktop, under their own heading, and on the You screen on a phone.
 *
 * §3: the loop always closes. La Strada is reachable from anywhere and the nav
 * always returns to Piazza, so nobody gets stuck inside a station.
 */

export type NavIcon = "piazza" | "strada" | "sociale" | "log" | "you";
export type NavItem = { href: string; label: string; icon?: NavIcon };

function useIsCurrent() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Line icons, in the reference's weight. Inline so they cost no request. */
function Icon({ name, className = "" }: { name: NavIcon; className?: string }) {
  const paths: Record<NavIcon, React.ReactNode> = {
    piazza: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    strada: (
      <>
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ),
    sociale: (
      <>
        <path d="M4 5h16v11H9l-5 4V5Z" />
        <path d="M8 9h8M8 12.5h5" />
      </>
    ),
    log: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    you: (
      <>
        <circle cx="12" cy="8.5" r="3.75" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export function PortalNavSidebar({
  items,
  admin = [],
  className = "",
}: {
  items: NavItem[];
  admin?: NavItem[];
  className?: string;
}) {
  const isCurrent = useIsCurrent();

  const link = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isCurrent(item.href) ? "page" : undefined}
      className={`flex items-center gap-3 rounded-full px-4 py-2 text-small transition ${
        isCurrent(item.href)
          ? "bg-ink font-medium text-cream"
          : "text-ink/70 hover:bg-cream-deep hover:text-ink"
      }`}
    >
      {item.icon ? <Icon name={item.icon} className="size-4.5" /> : null}
      {item.label}
    </Link>
  );

  return (
    <nav aria-label="Portal" className={`flex flex-col gap-1 ${className}`}>
      {items.map(link)}

      {admin.length > 0 ? (
        <>
          <p className="mt-6 mb-1 px-4 text-eyebrow font-medium uppercase text-ink/45">
            Admin
          </p>
          {admin.map(link)}
        </>
      ) : null}
    </nav>
  );
}

export function PortalNavBottom({ items }: { items: NavItem[] }) {
  const isCurrent = useIsCurrent();

  return (
    <nav
      aria-label="Portal"
      // Padded for the home indicator on notched phones. One of the two places
      // the glass blur is allowed — a single fixed element over scrolling
      // content is the case it exists for. See --aos-glass-blur.
      // The home indicator's space is reserved with env() and a fallback, as
      // an inline style rather than a Tailwind arbitrary value, so nothing in
      // the class pipeline can drop it (Dom, 14 Sep: the bar sat too high with
      // a strip below it).
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      className="glass fixed inset-x-0 bottom-0 z-20 border-t border-ink/8 lg:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const current = isCurrent(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-[0.65rem] font-medium transition ${
                  current ? "text-orange" : "text-ink/55 hover:text-ink"
                }`}
              >
                {item.icon ? (
                  <Icon name={item.icon} className={`size-6 ${current ? "" : "opacity-80"}`} />
                ) : null}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
