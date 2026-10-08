import Link from "next/link";

/**
 * The tab bar, on a phone: one control saying where you are, which opens
 * to say where else you could be.
 *
 * Eleven tabs in a sideways scroller meant the one you were on was
 * usually off the screen — measured on 8 October at 390px: 1188px of bar,
 * the current tab sitting at 1075, and nothing would scroll it there.
 * Two attempts to fix the scrolling failed. A scroller was the wrong
 * shape for eleven things (Dom, 8 October).
 *
 * **`<details>` and real links, not a `<select>` and a router.** The
 * select was the first build and never navigated: it depends on being
 * hydrated, and this codebase has now been caught twice by behaviour
 * that only exists once the JavaScript arrives — the publish confirm
 * published a month on the first click for exactly that reason. A
 * disclosure is HTML. It opens with no script, every entry is a link
 * that works with no script, and the browser gives the keyboard and
 * screen-reader handling for free.
 */
export function SectionPicker({
  sections,
  currentLabel,
  currentHref,
}: {
  sections: { label: string; href: string }[];
  /** What it says when shut: the section you are looking at. */
  currentLabel: string;
  currentHref: string;
}) {
  return (
    <details data-section-picker className="group mt-6 sm:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-ink/12 bg-card px-4 py-3 text-body font-medium text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{currentLabel}</span>
        {/* Turns to point up when the list is open, so the control says
            which way it goes rather than only that it opens. */}
        <span aria-hidden="true" className="text-ink/50 transition group-open:rotate-180">
          ▾
        </span>
      </summary>

      <nav aria-label="Report sections" className="mt-1 overflow-hidden rounded-xl border border-ink/12 bg-card">
        <ul>
          {sections.map((section) => {
            const isCurrent = section.href === currentHref;
            return (
              <li key={section.href} className="border-b border-ink/8 last:border-b-0">
                <Link
                  href={section.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`block px-4 py-3 text-body transition ${
                    isCurrent ? "bg-cream-deep font-medium text-ink" : "text-ink/70"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </details>
  );
}
