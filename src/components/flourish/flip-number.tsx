/**
 * A split-flap counter, for the hours-reclaimed number (Step 13).
 *
 * Each character falls into place left to right, the way a departure board
 * settles. Server-rendered and CSS-only: no client component, no count-up
 * loop, nothing to hydrate — the digits are already the right digits, they
 * just arrive one after another.
 *
 * **The whole value is in the DOM as text for a screen reader** and the
 * per-character spans are `aria-hidden`, so what is announced is "7.5", not
 * seven, point, five. Under reduced motion the animation is off and the
 * number is simply there (globals.css).
 *
 * Deliberately not a live counter: this number changes weekly, not by the
 * second, and a number that animates every render draws the eye to a thing
 * that has not changed.
 */
export function FlipNumber({
  value,
  className = "",
}: {
  /** Already formatted — "7.5", "128", "12h 30m". */
  value: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {[...value].map((character, index) => (
          <span
            key={`${index}-${character}`}
            className="flip-digit"
            // Left to right, and capped: a long number shouldn't take a
            // second and a half to finish arriving.
            style={{ animationDelay: `${Math.min(index * 55, 440)}ms` }}
          >
            {character === " " ? " " : character}
          </span>
        ))}
      </span>
    </span>
  );
}
