/**
 * FATTO — the stamp a signed-off week gets.
 *
 * From the build brief's Piazza section, "this week's log status (with a
 * FATTO stamp on completion)", built as part of Step 13's flourishes.
 *
 * Server-rendered, no JavaScript: it is a rotated box with a CSS animation,
 * so it costs nothing and cannot fail to hydrate. `aria-hidden` because the
 * card beside it already says the week is signed in words — the stamp is
 * the feeling, not the information, and a screen reader being told "FATTO"
 * in Italian would be the wrong half of it.
 */
export function FattoStamp({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`fatto pointer-events-none inline-flex select-none items-center justify-center rounded-md border-[3px] border-deep-red/70 px-3 py-1 ${className}`}
    >
      <span className="font-display text-heading leading-none font-semibold tracking-[0.18em] text-deep-red/80">
        FATTO
      </span>
    </span>
  );
}
