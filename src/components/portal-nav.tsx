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
 * Two components rather than one that renders both: the sidebar has to sit
 * inside a `lg:block` container, and a bottom bar nested in that container would
 * be hidden on exactly the screens it exists for.
 *
 * §3: the loop always closes. La Strada is reachable from anywhere and the nav
 * always returns to Piazza, so nobody gets stuck inside a station.
 */

export type NavItem = { href: string; label: string };

function useIsCurrent() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalNavSidebar({
  items,
  className = "",
}: {
  items: NavItem[];
  className?: string;
}) {
  const isCurrent = useIsCurrent();

  return (
    <nav aria-label="Portal" className={`flex flex-col gap-1 ${className}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(item.href) ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-small transition ${
            isCurrent(item.href)
              ? "bg-white/70 font-medium text-navy"
              : "text-navy/70 hover:bg-white/40 hover:text-navy"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function PortalNavBottom({ items }: { items: NavItem[] }) {
  const isCurrent = useIsCurrent();

  return (
    <nav
      aria-label="Portal"
      // Padded for the home indicator on notched phones.
      className="fixed inset-x-0 bottom-0 z-20 border-t border-navy/10 bg-off-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-1 px-2 py-3 text-caption transition ${
                isCurrent(item.href)
                  ? "font-medium text-navy"
                  : "text-navy/60 hover:text-navy"
              }`}
            >
              <span
                aria-hidden
                className={`h-0.5 w-6 rounded-full transition ${
                  isCurrent(item.href) ? "bg-orange" : "bg-transparent"
                }`}
              />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
