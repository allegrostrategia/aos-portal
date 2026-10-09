import { savedNotice } from "@/lib/reporting/saved-notice";

/**
 * "Saved." — rendered by the page, from `?saved=`.
 *
 * Server-rendered on purpose: the confirmation it replaces lived in the
 * action's return value and was observed disappearing when a form
 * submitted before React had attached. This one is in the HTML.
 *
 * `role="status"` so a screen reader announces it on arrival, which the
 * old inline `aria-live` did by being updated in place; after a
 * navigation there is no update, so the role has to be on the element
 * from the start.
 */
export function SavedBanner({ saved }: { saved: string | string[] | undefined }) {
  const notice = savedNotice(saved);
  if (!notice) return null;

  return (
    <p
      role="status"
      data-saved
      className="mb-6 rounded-xl border border-ink/10 bg-cream-deep px-4 py-3 text-small text-ink"
    >
      {notice}
    </p>
  );
}
