/**
 * A member's face, or their initials where there isn't one yet.
 *
 * Real uploaded headshots throughout is a L'Editoriale requirement, and the
 * fallback matters as much as the photo: a broken image or an empty circle on
 * the pairing screen says "nobody's here" about somebody who is. Initials on
 * cream say "not uploaded yet", which is the truth.
 *
 * A plain `<img>`, not next/image: the source is a signed storage URL that
 * changes on every render, so the optimiser would never hit its cache.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "size-9 text-small",
    md: "size-12 text-body",
    lg: "size-20 text-heading",
    xl: "size-28 text-title",
  } as const;

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-cream-deep font-display font-medium text-ink/70 ring-2 ring-card ${sizes[size]} ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
